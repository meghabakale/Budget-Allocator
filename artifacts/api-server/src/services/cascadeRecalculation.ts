/**
 * Production-Grade Cascading Recalculation Engine
 *
 * Allocation rules (applied in order):
 *   1. Priority: High > Medium > Low
 *   2. Tie-break: earlier createdAt wins
 *   3. If requestedAmount ≤ remaining AND prevStatus is NOT conflicted/pending_reapproval → APPROVED
 *   4. If requestedAmount ≤ remaining AND prevStatus is conflicted → PENDING_REAPPROVAL (no auto-approve!)
 *   5. If requestedAmount > remaining → CONFLICTED (pending_reapproval reverts to conflicted)
 *   6. Explicitly rejected requests are NEVER touched (admin decisions)
 *   7. PENDING_REAPPROVAL requests do NOT consume budget — admin approval commits funds
 */

import mongoose from "mongoose";
import Budget from "../models/Budget.js";
import BudgetRequest from "../models/BudgetRequest.js";
import AuditLog from "../models/AuditLog.js";
import { getIo } from "../sockets/index.js";
import { logger } from "../lib/logger.js";

export type TriggerType =
  | "REQUEST_CREATED"
  | "REQUEST_UPDATED"
  | "REQUEST_DELETED"
  | "CONFLICT_RESOLVED"
  | "ADMIN_OVERRIDE"
  | "SYSTEM_ROLLBACK"
  | "BUDGET_UPDATED"
  | "MANUAL";

const PRIORITY_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

/** Set of statuses that were previously denied and require admin re-approval when budget opens up */
const REQUIRES_REAPPROVAL = new Set(["conflicted"]);

/** In-process lock to prevent concurrent recalculations from racing */
let recalcRunning = false;
let recalcQueued = false;

export async function recalculateSystem(triggerType: TriggerType): Promise<void> {
  if (recalcRunning) {
    recalcQueued = true;
    return;
  }
  recalcRunning = true;
  try {
    await _doRecalculate(triggerType);
  } finally {
    recalcRunning = false;
    if (recalcQueued) {
      recalcQueued = false;
      setImmediate(() => recalculateSystem("MANUAL"));
    }
  }
}

async function _doRecalculate(triggerType: TriggerType): Promise<void> {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // ── 1. Fetch state ────────────────────────────────────────────────────
      const budget = await Budget.findOne().session(session);
      if (!budget) throw new Error("Budget pool not found");

      // Explicitly rejected = admin decision, never auto-touched.
      // pending_reapproval = waiting for admin approval, re-evaluate eligibility.
      const allRequests = await BudgetRequest.find({
        status: { $nin: ["rejected"] },
      })
        .session(session)
        .lean();

      const prevBudgetState = {
        totalBudget: budget.totalBudget,
        allocatedAmount: budget.allocatedAmount,
        remainingAmount: budget.remainingAmount,
      };
      const prevRequestStates = allRequests.map((r) => ({
        _id: r._id,
        status: r.status,
        allocatedAmount: r.allocatedAmount,
      }));

      // ── 2. Sort by priority desc, then createdAt asc ──────────────────────
      const sorted = [...allRequests].sort((a, b) => {
        const pDiff =
          (PRIORITY_ORDER[b.priorityLevel] ?? 0) -
          (PRIORITY_ORDER[a.priorityLevel] ?? 0);
        if (pDiff !== 0) return pDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      // ── 3. Sequential allocation pass ─────────────────────────────────────
      let remaining = budget.totalBudget;
      let totalAllocated = 0;

      const updates: Array<{
        id: mongoose.Types.ObjectId;
        status: string;
        allocatedAmount: number;
        prevStatus: string;
        prevAllocated: number;
        requiresReapproval: boolean;
      }> = [];

      for (const req of sorted) {
        const id = req._id as mongoose.Types.ObjectId;
        const prevStatus = req.status;

        if (req.requestedAmount <= remaining) {
          if (REQUIRES_REAPPROVAL.has(prevStatus)) {
            // Budget now available BUT previously denied — needs admin re-approval.
            // IMPORTANT: does NOT consume budget (remains uncommitted until admin acts).
            updates.push({
              id,
              status: "pending_reapproval",
              allocatedAmount: 0,
              prevStatus,
              prevAllocated: req.allocatedAmount,
              requiresReapproval: true,
            });
            // Do NOT deduct from remaining — pending_reapproval is not committed
          } else if (prevStatus === "pending_reapproval") {
            // Still waiting for admin — budget is available, keep status unchanged
            updates.push({
              id,
              status: "pending_reapproval",
              allocatedAmount: 0,
              prevStatus,
              prevAllocated: req.allocatedAmount,
              requiresReapproval: false,
            });
            // Also does NOT consume budget
          } else {
            // pending / approved / under_negotiation → approve normally
            updates.push({
              id,
              status: "approved",
              allocatedAmount: req.requestedAmount,
              prevStatus,
              prevAllocated: req.allocatedAmount,
              requiresReapproval: false,
            });
            remaining -= req.requestedAmount;
            totalAllocated += req.requestedAmount;
          }
        } else {
          // Budget not available — conflicted (pending_reapproval reverts to conflicted)
          updates.push({
            id,
            status: "conflicted",
            allocatedAmount: 0,
            prevStatus,
            prevAllocated: req.allocatedAmount,
            requiresReapproval: false,
          });
        }
      }

      // ── 4. Batch-write request updates ────────────────────────────────────
      if (updates.length > 0) {
        await Promise.all(
          updates.map((u) =>
            BudgetRequest.findByIdAndUpdate(
              u.id,
              { $set: { status: u.status, allocatedAmount: u.allocatedAmount }, $inc: { version: 1 } },
              { session }
            )
          )
        );
      }

      // ── 5. Update budget pool ─────────────────────────────────────────────
      budget.allocatedAmount = totalAllocated;
      budget.remainingAmount = budget.totalBudget - totalAllocated;
      await budget.save({ session });

      // ── 6. Audit log ──────────────────────────────────────────────────────
      const changedRequests = updates.filter(
        (u) => u.status !== u.prevStatus || u.allocatedAmount !== u.prevAllocated
      );
      const reapprovalRequests = updates.filter((u) => u.requiresReapproval);

      await AuditLog.create(
        [
          {
            userId: new mongoose.Types.ObjectId("000000000000000000000001"),
            username: "system",
            actionType: "RECALCULATION",
            entityId: budget._id,
            entityType: "Budget",
            previousState: { budget: prevBudgetState, requestSummary: prevRequestStates },
            newState: {
              budget: {
                totalBudget: budget.totalBudget,
                allocatedAmount: budget.allocatedAmount,
                remainingAmount: budget.remainingAmount,
              },
              changedRequests: changedRequests.map((u) => ({
                id: u.id,
                prevStatus: u.prevStatus,
                newStatus: u.status,
                prevAllocated: u.prevAllocated,
                newAllocated: u.allocatedAmount,
              })),
            },
            description: `System recalculation triggered by: ${triggerType}. ${changedRequests.length} request(s) changed. ${reapprovalRequests.length} moved to PENDING_REAPPROVAL (budget available — admin approval required).`,
          },
        ],
        { session }
      );

      // ── 7. Emit Socket.io events ──────────────────────────────────────────
      const budgetSnapshot = budget.toObject();
      const io = getIo();

      if (io) {
        const updatedRequests = await BudgetRequest.find({
          _id: { $in: updates.map((u) => u.id) },
        }).lean();

        io.emit("BUDGET_UPDATED", budgetSnapshot);

        for (const req of updatedRequests) {
          io.emit("REQUEST_STATUS_CHANGED", req);
          if (req.status === "conflicted") {
            io.emit("REQUEST_CONFLICTED", req);
          }
          if (req.status === "pending_reapproval") {
            io.emit("REQUEST_REQUIRES_REAPPROVAL", req);
          }
        }
      }

      logger.info(
        {
          triggerType,
          totalBudget: budget.totalBudget,
          allocated: budget.allocatedAmount,
          remaining: budget.remainingAmount,
          approved: updates.filter((u) => u.status === "approved").length,
          conflicted: updates.filter((u) => u.status === "conflicted").length,
          pendingReapproval: updates.filter((u) => u.status === "pending_reapproval").length,
          changed: changedRequests.length,
        },
        "Recalculation complete"
      );
    });
  } catch (err) {
    logger.error({ err, triggerType }, "Recalculation failed — system state may be inconsistent");
    throw err;
  } finally {
    await session.endSession();
  }
}

export async function runCascadeRecalculation(): Promise<void> {
  return recalculateSystem("MANUAL");
}
