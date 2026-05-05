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

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.user!.role !== "admin") filter["departmentId"] = req.user!.department.toLowerCase();
    const requests = await BudgetRequest.find(filter).populate("requestedBy", "username email").sort({ createdAt: -1 });
    res.json(requests);
  } catch {
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { requestedAmount, priorityLevel, justification } = req.body;
    const user = req.user!;
    const request = await BudgetRequest.create({
      departmentId: user.department.toLowerCase(),
      departmentName: user.department,
      requestedBy: new mongoose.Types.ObjectId(user.id),
      requestedAmount,
      priorityLevel: priorityLevel || "Medium",
      justification,
      status: "pending",
      version: 1,
    });
    await logAction({
      userId: user.id as unknown as mongoose.Types.ObjectId,
      username: user.username,
      actionType: "REQUEST_CREATED",
      entityId: request._id,
      entityType: "BudgetRequest",
      newState: request.toObject() as Record<string, unknown>,
      description: `Budget request created for ${user.department}: $${requestedAmount}`,
    });
    await runCascadeRecalculation();
    const budget = await Budget.findOne();
    const io = getIo();
    if (io) {
      io.emit("REQUEST_CREATED", request);
      io.emit("BUDGET_UPDATED", budget);
    }
    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: "Failed to create request" });
  }
});

router.put("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { requestedAmount, priorityLevel, justification, version } = req.body;
    const request = await BudgetRequest.findById(id);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }
    if (req.user!.role !== "admin" && request.departmentId !== req.user!.department.toLowerCase()) {
      res.status(403).json({ error: "Cannot update another department's request" }); return;
    }
    if (version !== undefined && request.version !== version) {
      request.status = "conflicted";
      await request.save();
      const io = getIo();
      if (io) io.emit("REQUEST_CONFLICTED", request);
      res.status(409).json({ error: "Version conflict detected", request });
      return;
    }
    const prev = request.toObject();
    if (requestedAmount !== undefined) request.requestedAmount = requestedAmount;
    if (priorityLevel !== undefined) request.priorityLevel = priorityLevel;
    if (justification !== undefined) request.justification = justification;
    request.version += 1;
    await request.save();
    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: "REQUEST_UPDATED",
      entityId: request._id,
      entityType: "BudgetRequest",
      previousState: prev as Record<string, unknown>,
      newState: request.toObject() as Record<string, unknown>,
      description: `Budget request updated for ${request.departmentName}`,
    });
    await runCascadeRecalculation();
    const budget = await Budget.findOne();
    const io = getIo();
    if (io) {
      io.emit("REQUEST_UPDATED", request);
      io.emit("BUDGET_UPDATED", budget);
    }
    res.json(request);
  } catch {
    res.status(500).json({ error: "Failed to update request" });
  }
});

router.delete("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const request = await BudgetRequest.findById(id);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }
    if (req.user!.role !== "admin" && request.departmentId !== req.user!.department.toLowerCase()) {
      res.status(403).json({ error: "Cannot delete another department's request" }); return;
    }
    await request.deleteOne();
    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: "REQUEST_DELETED",
      entityId: id as unknown as mongoose.Types.ObjectId,
      entityType: "BudgetRequest",
      previousState: request.toObject() as Record<string, unknown>,
      description: `Budget request deleted for ${request.departmentName}`,
    });
    await runCascadeRecalculation();
    const budget = await Budget.findOne();
    const io = getIo();
    if (io) {
      io.emit("REQUEST_UPDATED", { _id: id, deleted: true });
      io.emit("BUDGET_UPDATED", budget);
    }
    res.json({ message: "Request deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete request" });
  }
});

export default router;
