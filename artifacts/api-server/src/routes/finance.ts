import { Router } from "express";
import mongoose from "mongoose";
import Budget from "../models/Budget.js";
import AdminAllocation from "../models/AdminAllocation.js";
import BudgetRequest from "../models/BudgetRequest.js";
import User from "../models/User.js";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { requireFinanceManager } from "../middleware/roleAuth.js";
import { logAction } from "../services/auditService.js";
import { runWeightedAllocation, overrideAdminAllocation } from "../services/weightedAllocationService.js";
import { recalculateSystem } from "../services/cascadeRecalculation.js";
import { getIo } from "../sockets/index.js";

const router = Router();

/**
 * GET /api/finance/overview
 * Full system view: budget, all admin allocations, all requests
 */
router.get("/overview", authenticate, requireFinanceManager, async (_req, res) => {
  try {
    const [budget, allocations, requests, users] = await Promise.all([
      Budget.findOne(),
      AdminAllocation.find().sort({ allocationScore: -1 }),
      BudgetRequest.find().sort({ createdAt: -1 }),
      User.find({ role: { $in: ["location_admin", "department_head"] } }).select("-password"),
    ]);

    const totalDemand = allocations.reduce((s, a) => s + a.totalDemand, 0);
    const totalAllocated = allocations.reduce((s, a) => s + a.allocatedBudget, 0);

    res.json({
      budget,
      allocations,
      requests,
      summary: {
        totalLocations: allocations.length,
        totalDemand,
        totalAllocated,
        surplus: (budget?.totalBudget ?? 0) - totalAllocated,
        overDemand: totalDemand > (budget?.totalBudget ?? 0),
        demandExcess: Math.max(0, totalDemand - (budget?.totalBudget ?? 0)),
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch finance overview" });
  }
});

/**
 * POST /api/finance/allocate-budget
 * Run weighted allocation across all admins.
 * Finance Manager can also set individual priority scores before running.
 */
router.post("/allocate-budget", authenticate, requireFinanceManager, async (req: AuthRequest, res) => {
  try {
    const { priorityOverrides } = req.body as {
      priorityOverrides?: Record<string, number>; // adminId → priorityScore
    };

    // Apply priority overrides if provided
    if (priorityOverrides) {
      await Promise.all(
        Object.entries(priorityOverrides).map(([adminId, score]) =>
          AdminAllocation.findOneAndUpdate({ adminId }, { priorityScore: score })
        )
      );
    }

    const results = await runWeightedAllocation();

    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: "FINANCE_WEIGHTED_ALLOCATION",
      entityId: "system" as unknown as mongoose.Types.ObjectId,
      entityType: "AdminAllocation",
      newState: { results } as Record<string, unknown>,
      description: `Finance Manager ran weighted allocation across ${results.length} locations`,
    });

    // Trigger cascading recalculation at request level too
    recalculateSystem("ADMIN_OVERRIDE").catch(() => {});

    res.json({ message: "Weighted allocation applied", results });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Allocation failed" });
  }
});

/**
 * PUT /api/finance/override-allocation
 * Finance Manager manually sets a specific admin's budget allocation.
 */
router.put("/override-allocation", authenticate, requireFinanceManager, async (req: AuthRequest, res) => {
  try {
    const { adminId, allocatedBudget, adminNote } = req.body;
    const prev = await AdminAllocation.findOne({ adminId });

    const updated = await overrideAdminAllocation(adminId, allocatedBudget);

    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: "FINANCE_OVERRIDE_ALLOCATION",
      entityId: adminId as unknown as mongoose.Types.ObjectId,
      entityType: "AdminAllocation",
      previousState: prev?.toObject() as unknown as Record<string, unknown>,
      newState: updated.toObject() as unknown as Record<string, unknown>,
      description: `Finance Manager overrode allocation for ${updated.location}: $${allocatedBudget.toLocaleString()}${adminNote ? ` — ${adminNote}` : ""}`,
    });

    recalculateSystem("ADMIN_OVERRIDE").catch(() => {});
    res.json(updated);
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Override failed" });
  }
});

/**
 * PUT /api/finance/set-priority
 * Finance Manager updates strategic priority scores for locations.
 */
router.put("/set-priority", authenticate, requireFinanceManager, async (req: AuthRequest, res) => {
  try {
    const { adminId, priorityScore, performanceScore } = req.body;
    const update: Record<string, unknown> = {};
    if (priorityScore !== undefined) update["priorityScore"] = priorityScore;
    if (performanceScore !== undefined) update["performanceScore"] = performanceScore;

    const updated = await AdminAllocation.findOneAndUpdate({ adminId }, { $set: update }, { new: true });
    if (!updated) { res.status(404).json({ error: "Admin allocation not found" }); return; }

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update priority" });
  }
});

/**
 * GET /api/finance/admins
 * List all location admins with their allocation records.
 */
router.get("/admins", authenticate, requireFinanceManager, async (_req, res) => {
  try {
    const allocations = await AdminAllocation.find().sort({ allocationScore: -1 });
    res.json(allocations);
  } catch {
    res.status(500).json({ error: "Failed to fetch admins" });
  }
});

export default router;
