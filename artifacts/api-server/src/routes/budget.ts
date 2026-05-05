import { Router } from "express";
import Budget from "../models/Budget.js";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleAuth.js";
import { logAction } from "../services/auditService.js";
import { runCascadeRecalculation } from "../services/cascadeRecalculation.js";
import type mongoose from "mongoose";

const router = Router();

router.get("/", authenticate, async (_req, res) => {
  try {
    let budget = await Budget.findOne();
    if (!budget) budget = await Budget.create({ totalBudget: 1000000, allocatedAmount: 0, remainingAmount: 1000000 });
    res.json(budget);
  } catch {
    res.status(500).json({ error: "Failed to fetch budget" });
  }
});

router.put("/update", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const { totalBudget } = req.body;
    const budget = await Budget.findOne();
    if (!budget) { res.status(404).json({ error: "Budget not found" }); return; }
    const prev = budget.toObject();
    budget.totalBudget = totalBudget;
    budget.remainingAmount = totalBudget - budget.allocatedAmount;
    await budget.save();
    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: "BUDGET_UPDATED",
      entityId: budget._id,
      entityType: "Budget",
      previousState: prev as Record<string, unknown>,
      newState: budget.toObject() as Record<string, unknown>,
      description: `Total budget updated to ${totalBudget}`,
    });
    await runCascadeRecalculation();
    const updated = await Budget.findOne();
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update budget" });
  }
});

export default router;
