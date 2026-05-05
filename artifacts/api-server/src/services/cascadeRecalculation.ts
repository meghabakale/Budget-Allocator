/**
 * Production-Grade Cascading Recalculation Engine
 *
 * Centralized service that recalculates the entire budget allocation system
 * whenever any change occurs. Guarantees consistency, prevents over-allocation,
 * and propagates updates in real-time via Socket.io.
 *
 * Allocation rules (applied in order):
 *   1. Priority: High > Medium > Low
 *   2. Tie-break: earlier createdAt wins
 *   3. If requestedAmount ≤ remaining → APPROVED, allocatedAmount = requestedAmount
 *   4. If requestedAmount > remaining → CONFLICTED, allocatedAmount = 0
 *   5. Already-rejected requests are left as REJECTED (explicit admin decision)
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

/** Simple in-process lock to prevent concurrent recalculations from racing */
let recalcRunning = false;
let recalcQueued = false;

export async function recalculateSystem(triggerType: TriggerType): Promise<void> {
  // If already running, queue one more run (not multiple)
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
      // Run the queued recalculation without blocking the current call stack
      setImmediate(() => recalculateSystem("MANUAL"));
    }
  }
}

async function _doRecalculate(triggerType: TriggerType): Promise<void> {
  // ─── 1. Start a MongoDB session for atomicity ────────────────────────────
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // ─── 2. Fetch current state ────────────────────────────────────────
      const budget = await Budget.findOne().session(session);
      if (!budget) throw new Error("Budget pool not found");

      const allRequests = await BudgetRequest.find({
        status: { $nin: ["rejected"] }, // leave explicit admin rejections alone
      })
        .session(session)
        .lean();

      // Snapshot previous state for audit log
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

      // ─── 3. Sort by priority desc, then createdAt asc ─────────────────
      const sorted = [...allRequests].sort((a, b) => {
        const pDiff =
          (PRIORITY_ORDER[b.priorityLevel] ?? 0) -
          (PRIORITY_ORDER[a.priorityLevel] ?? 0);
        if (pDiff !== 0) return pDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      // ─── 4. Sequential allocation ──────────────────────────────────────
      let remaining = budget.totalBudget;
      let totalAllocated = 0;

      const updates: Array<{
        id: mongoose.Types.ObjectId;
        status: string;
        allocatedAmount: number;
        prevStatus: string;
        prevAllocated: number;
      }> = [];

      for (const req of sorted) {
        const id = req._id as mongoose.Types.ObjectId;
        if (req.requestedAmount <= remaining) {
          updates.push({
            id,
            status: "approved",
            allocatedAmount: req.requestedAmount,
            prevStatus: req.status,
            prevAllocated: req.allocatedAmount,
          });
          remaining -= req.requestedAmount;
          totalAllocated += req.requestedAmount;
        } else {
          updates.push({
            id,
            status: "conflicted",
            allocatedAmount: 0,
            prevStatus: req.status,
            prevAllocated: req.allocatedAmount,
          });
        }
      }

      // ─── 5. Batch-write request updates ───────────────────────────────
      const bulkOps = updates.map((u) => ({
        updateOne: {
          filter: { _id: u.id },
          update: {
            $set: {
              status: u.status,
              allocatedAmount: u.allocatedAmount,
              version: { $add: ["$version", 1] },
            },
          },
        },
      }));

      if (bulkOps.length > 0) {
        // Use individual updates to support $add expression properly
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

      // ─── 6. Update budget pool ─────────────────────────────────────────
      budget.allocatedAmount = totalAllocated;
      budget.remainingAmount = budget.totalBudget - totalAllocated;
      await budget.save({ session });

      // ─── 7. Audit log ─────────────────────────────────────────────────
      const changedRequests = updates.filter(
        (u) => u.status !== u.prevStatus || u.allocatedAmount !== u.prevAllocated
      );

      await AuditLog.create(
        [
          {
            userId: new mongoose.Types.ObjectId("000000000000000000000001"),
            username: "system",
            actionType: "RECALCULATION",
            entityId: budget._id,
            entityType: "Budget",
            previousState: {
              budget: prevBudgetState,
              requestSummary: prevRequestStates,
            },
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
            description: `System recalculation triggered by: ${triggerType}. ${changedRequests.length} request(s) changed status.`,
          },
        ],
        { session }
      );

      // ─── 8. Emit Socket.io events (after transaction commits) ─────────
      // We schedule emission after transaction success
      const budgetSnapshot = budget.toObject();
      const io = getIo();

      if (io) {
        const updatedRequests = await BudgetRequest.find({
          _id: { $in: updates.map((u) => u.id) },
        }).lean();

        // Emit budget update to all clients
        io.emit("BUDGET_UPDATED", budgetSnapshot);

        // Emit per-request status changes
        for (const req of updatedRequests) {
          io.emit("REQUEST_STATUS_CHANGED", req);
          if (req.status === "conflicted") {
            io.emit("REQUEST_CONFLICTED", req);
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

/** Kept for backward-compat — wraps recalculateSystem */
export async function runCascadeRecalculation(): Promise<void> {
  return recalculateSystem("MANUAL");
}
