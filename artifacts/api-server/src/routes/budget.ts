import { Router } from "express";
import mongoose from "mongoose";
import Budget from "../models/Budget.js";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { requireFinanceManager } from "../middleware/roleAuth.js";
import { logAction } from "../services/auditService.js";
import { recalculateSystem } from "../services/cascadeRecalculation.js";

const router = Router();

router.get("/", authenticate, async (_req, res) => {
  try {
    let budget = await Budget.findOne();
    if (!budget) {
      budget = await Budget.create({
        totalBudget: 1000000,
        allocatedAmount: 0,
        remainingAmount: 1000000,
      });
    }
    res.json(budget);
  } catch {
    res.status(500).json({ error: "Failed to fetch budget" });
  }
});

// Only Finance Manager (or legacy admin) can change the global budget pool
router.put("/update", authenticate, requireFinanceManager, async (req: AuthRequest, res) => {
  try {
    const { totalBudget } = req.body;

    if (typeof totalBudget !== "number" || totalBudget < 0) {
      res.status(400).json({ error: "totalBudget must be a non-negative number" }); return;
    }

    const budget = await Budget.findOne();
    if (!budget) { res.status(404).json({ error: "Budget not found" }); return; }

    const prev = budget.toObject();
    budget.totalBudget = totalBudget;
    await budget.save();

    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: "BUDGET_UPDATED",
      entityId: budget._id,
      entityType: "Budget",
      previousState: prev as unknown as Record<string, unknown>,
      newState: budget.toObject() as unknown as Record<string, unknown>,
      description: `Total budget changed from $${prev.totalBudget.toLocaleString()} to $${totalBudget.toLocaleString()} by ${req.user!.username}`,
    });

    await recalculateSystem("BUDGET_UPDATED");

    const updated = await Budget.findOne();
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update budget" });
  }
});

export default router;
