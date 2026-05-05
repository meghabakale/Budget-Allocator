import { Router } from "express";
import mongoose from "mongoose";
import BudgetRequest from "../models/BudgetRequest.js";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleAuth.js";
import { logAction } from "../services/auditService.js";
import { recalculateSystem } from "../services/cascadeRecalculation.js";
import { getIo } from "../sockets/index.js";

const router = Router();

/**
 * Admin resolves a conflict: approve / reject / adjust
 * After the decision is recorded, the recalculation engine re-runs
 * to enforce consistency across all remaining requests.
 */
router.post("/resolve", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const { requestId, action, allocatedAmount, adminNote } = req.body;

    const request = await BudgetRequest.findById(requestId);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }

    const prev = request.toObject();

    switch (action) {
      case "approve":
        request.status = "approved";
        request.allocatedAmount = allocatedAmount ?? request.requestedAmount;
        break;
      case "reject":
        request.status = "rejected";
        request.allocatedAmount = 0;
        break;
      case "adjust":
        request.status = "approved";
        request.allocatedAmount = Number(allocatedAmount);
        break;
      default:
        res.status(400).json({ error: `Unknown action: ${action}` }); return;
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
      description: `Admin ${action}d conflict for ${request.departmentName} — allocated $${request.allocatedAmount}${adminNote ? ` (note: ${adminNote})` : ""}`,
    });

    // Notify immediately, then let engine enforce full consistency
    const io = getIo();
    if (io) io.emit("REQUEST_STATUS_CHANGED", request);

    recalculateSystem("CONFLICT_RESOLVED").catch(() => {});

    res.json(request);
  } catch {
    res.status(500).json({ error: "Failed to resolve conflict" });
  }
});

/**
 * Admin rolls back a request to pending status.
 * The recalculation engine re-evaluates everything afterward.
 */
router.post("/rollback/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const request = await BudgetRequest.findById(id);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }

    const prev = request.toObject();
    request.status = "pending";
    request.allocatedAmount = 0;
    request.adminNote = undefined;
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
      description: `Request for ${request.departmentName} rolled back to pending by admin (was: ${prev.status}, allocated: $${prev.allocatedAmount})`,
    });

    const io = getIo();
    if (io) io.emit("REQUEST_STATUS_CHANGED", request);

    recalculateSystem("SYSTEM_ROLLBACK").catch(() => {});

    res.json(request);
  } catch {
    res.status(500).json({ error: "Failed to rollback request" });
  }
});

export default router;
