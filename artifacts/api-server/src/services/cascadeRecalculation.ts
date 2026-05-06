/**
 * Production-Grade Cascading Recalculation Engine
 *
 * Allocation rules:
 *   1. Only APPROVED requests consume budget — admin must explicitly approve.
 *   2. PENDING / UNDER_REVIEW / UNDER_NEGOTIATION / CRITICAL are admin-workflow states.
 *      The engine NEVER auto-approves them. Their allocatedAmount stays 0.
 *   3. If an APPROVED request no longer fits (budget shrunk) → CONFLICTED.
 *   4. CONFLICTED request fits within remaining budget → PENDING_REAPPROVAL (admin must re-approve).
 *   5. PENDING_REAPPROVAL still fits → stay PENDING_REAPPROVAL (keep waiting for admin).
 *   6. PENDING_REAPPROVAL no longer fits → back to CONFLICTED.
 *   7. REJECTED requests are never touched (admin decisions are final).
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

/** Statuses that are pure admin-workflow states — engine leaves them untouched */
const ADMIN_WORKFLOW_STATUSES = new Set([
  "pending",
  "under_review",
  "under_negotiation",
  "critical",
]);

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

const PRIORITY_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

async function _doRecalculate(triggerType: TriggerType): Promise<void> {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // ── 1. Fetch state ─────────────────────────────────────────────────────
      const budget = await Budget.findOne().session(session);
      if (!budget) throw new Error("Budget pool not found");

      // Only process requests that are relevant to budget math:
      // approved, conflicted, pending_reapproval
      // Skip: rejected (final), pending/under_review/under_negotiation/critical (admin manages)
      const relevantRequests = await BudgetRequest.find({
        status: { $in: ["approved", "conflicted", "pending_reapproval"] },
      })
        .session(session)
        .lean();

      const prevBudgetState = {
        totalBudget: budget.totalBudget,
        allocatedAmount: budget.allocatedAmount,
        remainingAmount: budget.remainingAmount,
      };
      const prevRequestStates = relevantRequests.map((r) => ({
        _id: r._id,
        status: r.status,
        allocatedAmount: r.allocatedAmount,
      }));

      // ── 2. Sort: approved first (by priority desc, createdAt asc), then others ──
      const sorted = [...relevantRequests].sort((a, b) => {
        // Approved requests get priority in allocation ordering
        const aApproved = a.status === "approved" ? 1 : 0;
        const bApproved = b.status === "approved" ? 1 : 0;
        if (bApproved !== aApproved) return bApproved - aApproved;
        const pDiff =
          (PRIORITY_ORDER[b.priorityLevel] ?? 0) -
          (PRIORITY_ORDER[a.priorityLevel] ?? 0);
        if (pDiff !== 0) return pDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      // ── 3. Sequential allocation pass ──────────────────────────────────────
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

        if (prevStatus === "approved") {
          // Keep approved if it still fits; otherwise conflict it
          if (req.requestedAmount <= remaining) {
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
          } else {
            // Budget no longer covers this approved request
            updates.push({
              id,
              status: "conflicted",
              allocatedAmount: 0,
              prevStatus,
              prevAllocated: req.allocatedAmount,
              requiresReapproval: false,
            });
          }
        } else if (prevStatus === "conflicted") {
          // Budget opened up — move to pending_reapproval for admin action
          if (req.requestedAmount <= remaining) {
            updates.push({
              id,
              status: "pending_reapproval",
              allocatedAmount: 0,
              prevStatus,
              prevAllocated: req.allocatedAmount,
              requiresReapproval: true,
            });
            // Does NOT consume budget — admin must approve first
          } else {
            updates.push({
              id,
              status: "conflicted",
              allocatedAmount: 0,
              prevStatus,
              prevAllocated: req.allocatedAmount,
              requiresReapproval: false,
            });
          }
        } else if (prevStatus === "pending_reapproval") {
          // Still waiting for admin — check if budget still available
          if (req.requestedAmount <= remaining) {
            updates.push({
              id,
              status: "pending_reapproval",
              allocatedAmount: 0,
              prevStatus,
              prevAllocated: req.allocatedAmount,
              requiresReapproval: false,
            });
            // Does NOT consume budget
          } else {
            // Budget shrunk again — revert to conflicted
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
        // Admin-workflow statuses (pending/under_review/under_negotiation/critical)
        // are never processed here — they are untouched by the engine
      }

      // ── 4. Batch-write request updates ─────────────────────────────────────
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

      // ── 5. Update budget pool ───────────────────────────────────────────────
      budget.allocatedAmount = totalAllocated;
      budget.remainingAmount = budget.totalBudget - totalAllocated;
      await budget.save({ session });

      // ── 6. Audit log ────────────────────────────────────────────────────────
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
            description: `System recalculation triggered by: ${triggerType}. ${changedRequests.length} request(s) changed. ${reapprovalRequests.length} moved to PENDING_REAPPROVAL (budget available — admin approval required). NOTE: Admin-workflow requests (pending/under_review/under_negotiation/critical) were NOT auto-approved.`,
          },
        ],
        { session }
      );

      // ── 7. Emit Socket.io events ────────────────────────────────────────────
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
        "Recalculation complete — no auto-approvals, admin-workflow statuses preserved"
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
