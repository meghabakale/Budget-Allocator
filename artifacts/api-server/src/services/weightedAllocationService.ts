/**
 * Weighted Dynamic Budget Allocation Service
 *
 * Distributes total budget across location admins using a weighted formula:
 *   allocationScore = (0.5 × normalizedPriority) + (0.3 × demandScore) + (0.2 × performanceScore)
 *
 * Where:
 *   normalizedPriority = priorityScore / 10  (Finance Manager sets 1–10)
 *   demandScore        = adminDemand / totalDemand  (proportion of total ask)
 *   performanceScore   = historical utilization efficiency (0–1)
 *
 * Final allocation = (adminScore / sumAllScores) × totalBudget
 *
 * This guarantees NO equal distribution — high-demand, high-priority, efficient
 * admins receive proportionally more budget.
 */

import mongoose from "mongoose";
import Budget from "../models/Budget.js";
import AdminAllocation from "../models/AdminAllocation.js";
import BudgetRequest from "../models/BudgetRequest.js";
import User from "../models/User.js";
import { getIo } from "../sockets/index.js";
import { logger } from "../lib/logger.js";

export interface AllocationResult {
  adminId: string;
  location: string;
  demand: number;
  allocated: number;
  score: number;
}

export async function runWeightedAllocation(
  session?: mongoose.ClientSession
): Promise<AllocationResult[]> {
  const budget = await Budget.findOne().session(session ?? null);
  if (!budget) throw new Error("Budget pool not found");

  const allocations = await AdminAllocation.find().session(session ?? null);
  if (allocations.length === 0) return [];

  // ── 1. Recompute each admin's live demand from pending+conflicted requests ──
  const locationAdmins = await User.find({
    role: { $in: ["location_admin", "admin"] },
    location: { $ne: "" },
  }).session(session ?? null);

  for (const admin of locationAdmins) {
    const deptRequests = await BudgetRequest.find({
      status: { $in: ["pending", "conflicted", "under_negotiation", "approved"] },
      departmentId: { $regex: new RegExp(admin.location, "i") },
    }).session(session ?? null);

    const demand = deptRequests.reduce((s, r) => s + r.requestedAmount, 0);
    const usedBudget = deptRequests
      .filter((r) => r.status === "approved")
      .reduce((s, r) => s + r.allocatedAmount, 0);

    const alloc = allocations.find(
      (a) => a.adminId.toString() === admin._id.toString()
    );
    if (alloc) {
      alloc.totalDemand = demand;
      alloc.usedBudget = usedBudget;
    }
  }

  const totalDemand = allocations.reduce((s, a) => s + a.totalDemand, 0);

  // ── 2. Compute weighted scores ─────────────────────────────────────────────
  for (const alloc of allocations) {
    const normalizedPriority = alloc.priorityScore / 10;
    const demandScore = totalDemand > 0 ? alloc.totalDemand / totalDemand : 1 / allocations.length;
    const performanceScore = alloc.performanceScore;

    alloc.demandScore = demandScore;
    alloc.allocationScore =
      0.5 * normalizedPriority + 0.3 * demandScore + 0.2 * performanceScore;
  }

  const totalScore = allocations.reduce((s, a) => s + a.allocationScore, 0);

  // ── 3. Distribute budget proportionally ───────────────────────────────────
  const results: AllocationResult[] = [];
  let sumAllocated = 0;

  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];
    const isLast = i === allocations.length - 1;

    const share = totalScore > 0 ? alloc.allocationScore / totalScore : 1 / allocations.length;
    // Give remainder to last admin to avoid rounding drift
    const allocated = isLast
      ? budget.totalBudget - sumAllocated
      : Math.floor(share * budget.totalBudget);

    alloc.allocatedBudget = allocated;
    alloc.remainingBudget = Math.max(0, allocated - alloc.usedBudget);
    sumAllocated += allocated;

    await alloc.save({ session });

    results.push({
      adminId: alloc.adminId.toString(),
      location: alloc.location,
      demand: alloc.totalDemand,
      allocated,
      score: Math.round(alloc.allocationScore * 1000) / 1000,
    });
  }

  logger.info({ results, totalBudget: budget.totalBudget }, "Weighted allocation complete");

  // ── 4. Emit real-time update ───────────────────────────────────────────────
  const io = getIo();
  if (io) io.emit("ADMIN_ALLOCATION_UPDATED", results);

  return results;
}

/** Finance Manager manually overrides a single admin's allocation */
export async function overrideAdminAllocation(
  adminId: string,
  newAllocated: number
): Promise<IAdminAllocation> {
  const alloc = await AdminAllocation.findOne({ adminId });
  if (!alloc) throw new Error("Admin allocation not found");

  const budget = await Budget.findOne();
  if (!budget) throw new Error("Budget not found");

  // Ensure no over-allocation of total budget
  const otherTotal = (
    await AdminAllocation.find({ adminId: { $ne: adminId } })
  ).reduce((s, a) => s + a.allocatedBudget, 0);

  if (otherTotal + newAllocated > budget.totalBudget) {
    throw new Error(
      `Override would exceed total budget. Other admins already have $${otherTotal.toLocaleString()}.`
    );
  }

  alloc.allocatedBudget = newAllocated;
  alloc.remainingBudget = Math.max(0, newAllocated - alloc.usedBudget);
  await alloc.save();

  const io = getIo();
  if (io) io.emit("ADMIN_ALLOCATION_UPDATED", [alloc]);

  return alloc;
}

// Re-export type for convenience
type IAdminAllocation = import("../models/AdminAllocation.js").IAdminAllocation;
