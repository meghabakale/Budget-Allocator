import { Router } from "express";
import mongoose from "mongoose";
import BudgetRequest from "../models/BudgetRequest.js";
import Budget from "../models/Budget.js";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleAuth.js";
import { logAction } from "../services/auditService.js";
import { runCascadeRecalculation } from "../services/cascadeRecalculation.js";
import { getIo } from "../sockets/index.js";

const router = Router();

router.post("/resolve", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const { requestId, action, allocatedAmount, adminNote } = req.body;
    const request = await BudgetRequest.findById(requestId);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }
    const prev = request.toObject();

    if (action === "approve") {
      const budget = await Budget.findOne();
      if (!budget) { res.status(404).json({ error: "Budget not found" }); return; }
      const amount = allocatedAmount ?? request.requestedAmount;
      if (amount > budget.remainingAmount + (request.status === "approved" ? request.allocatedAmount : 0)) {
        res.status(400).json({ error: "Insufficient budget remaining" }); return;
      }
      request.status = "approved";
      request.allocatedAmount = amount;
    } else if (action === "reject") {
      request.status = "rejected";
      request.allocatedAmount = 0;
    } else if (action === "adjust") {
      request.status = "approved";
      request.allocatedAmount = allocatedAmount;
    }

    if (adminNote) request.adminNote = adminNote;
    request.version += 1;
    await request.save();

    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: `CONFLICT_${action.toUpperCase()}`,
      entityId: request._id,
      entityType: "BudgetRequest",
      previousState: prev as Record<string, unknown>,
      newState: request.toObject() as Record<string, unknown>,
      description: `Admin ${action}d request for ${request.departmentName} (conflict resolved)`,
    });

    await runCascadeRecalculation();
    const budget = await Budget.findOne();
    const io = getIo();
    if (io) {
      io.emit("REQUEST_STATUS_CHANGED", request);
      io.emit("BUDGET_UPDATED", budget);
    }
    res.json(request);
  } catch {
    res.status(500).json({ error: "Failed to resolve conflict" });
  }
});

router.post("/rollback/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const request = await BudgetRequest.findById(id);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }
    const prev = request.toObject();
    request.status = "pending";
    request.allocatedAmount = 0;
    request.version += 1;
    await request.save();
    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: "REQUEST_ROLLBACK",
      entityId: request._id,
      entityType: "BudgetRequest",
      previousState: prev as Record<string, unknown>,
      newState: request.toObject() as Record<string, unknown>,
      description: `Request for ${request.departmentName} rolled back to pending`,
    });
    await runCascadeRecalculation();
    const budget = await Budget.findOne();
    const io = getIo();
    if (io) {
      io.emit("REQUEST_STATUS_CHANGED", request);
      io.emit("BUDGET_UPDATED", budget);
    }
    res.json(request);
  } catch {
    res.status(500).json({ error: "Failed to rollback request" });
  }
});

export default router;
