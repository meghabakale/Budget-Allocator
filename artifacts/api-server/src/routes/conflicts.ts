import { Router } from "express";
import mongoose from "mongoose";
import Budget from "../models/Budget.js";
import BudgetRequest from "../models/BudgetRequest.js";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { requireLocationAdmin } from "../middleware/roleAuth.js";
import { logAction } from "../services/auditService.js";
import { recalculateSystem } from "../services/cascadeRecalculation.js";
import { getIo } from "../sockets/index.js";

const router = Router();

/**
 * Any admin (location or finance) can resolve a conflict or approve a pending_reapproval.
 * Location admins can only act within their own location.
 * On approval: budget availability is checked before committing.
 */
router.post("/resolve", authenticate, requireLocationAdmin, async (req: AuthRequest, res) => {
  try {
    const { requestId, action, allocatedAmount, adminNote } = req.body;

    const request = await BudgetRequest.findById(requestId);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }

    // Location admins can only manage their own location's requests
    const isGlobal = ["finance_manager", "admin"].includes(req.user!.role);
    if (!isGlobal && req.user!.role === "location_admin") {
      const inLocation = request.departmentName.includes(`(${req.user!.location})`);
      if (!inLocation) {
        res.status(403).json({ error: "Cannot resolve conflicts outside your location" }); return;
      }
    }

    const prev = request.toObject();
    const prevStatus = request.status;

    switch (action) {
      case "approve": {
        // Budget check before approving
        const budget = await Budget.findOne();
        if (!budget) { res.status(500).json({ error: "Budget pool not found" }); return; }
        const effectiveAmount = allocatedAmount ?? request.requestedAmount;
        if (effectiveAmount > budget.remainingAmount) {
          res.status(409).json({
            error: "Insufficient budget to approve this request",
            requestedAmount: effectiveAmount,
            remainingBudget: budget.remainingAmount,
          });
          return;
        }
        request.status = "approved";
        request.allocatedAmount = effectiveAmount;
        break;
      }
      case "reject":
        request.status = "rejected";
        request.allocatedAmount = 0;
        break;
      case "adjust": {
        const budget = await Budget.findOne();
        if (!budget) { res.status(500).json({ error: "Budget pool not found" }); return; }
        const adjustedAmount = Number(allocatedAmount);
        if (adjustedAmount > budget.remainingAmount) {
          res.status(409).json({
            error: "Insufficient budget for adjusted amount",
            requestedAmount: adjustedAmount,
            remainingBudget: budget.remainingAmount,
          });
          return;
        }
        request.status = "approved";
        request.allocatedAmount = adjustedAmount;
        break;
      }
      default:
        res.status(400).json({ error: `Unknown action: ${action}` }); return;
    }

    if (adminNote) request.adminNote = adminNote;
    request.version += 1;
    await request.save();

    const actionTypeMap: Record<string, string> = {
      approve: prevStatus === "pending_reapproval" ? "REAPPROVAL_APPROVED" : "CONFLICT_APPROVE",
      reject: prevStatus === "pending_reapproval" ? "REAPPROVAL_REJECTED" : "CONFLICT_REJECT",
      adjust: prevStatus === "pending_reapproval" ? "REAPPROVAL_ADJUSTED" : "CONFLICT_ADJUST",
    };

    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: actionTypeMap[action] ?? `CONFLICT_${action.toUpperCase()}`,
      entityId: request._id,
      entityType: "BudgetRequest",
      previousState: { ...prev, previousStatus: prevStatus } as Record<string, unknown>,
      newState: { ...request.toObject(), newStatus: request.status } as Record<string, unknown>,
      description: `${req.user!.username} ${action}d ${prevStatus === "pending_reapproval" ? "re-approval" : "conflict"} for ${request.departmentName} — allocated ₹${request.allocatedAmount.toLocaleString("en-IN")}${adminNote ? ` (note: ${adminNote})` : ""}`,
    });

    const io = getIo();
    if (io) io.emit("REQUEST_STATUS_CHANGED", request);

    recalculateSystem("CONFLICT_RESOLVED").catch(() => {});

    res.json(request);
  } catch {
    res.status(500).json({ error: "Failed to resolve conflict" });
  }
});

router.post("/rollback/:id", authenticate, requireLocationAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const request = await BudgetRequest.findById(id);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }

    const isGlobal = ["finance_manager", "admin"].includes(req.user!.role);
    if (!isGlobal && req.user!.role === "location_admin") {
      const inLocation = request.departmentName.includes(`(${req.user!.location})`);
      if (!inLocation) {
        res.status(403).json({ error: "Cannot rollback requests outside your location" }); return;
      }
    }

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
      previousState: { ...prev, previousStatus: prev.status } as Record<string, unknown>,
      newState: { ...request.toObject(), newStatus: "pending" } as Record<string, unknown>,
      description: `${req.user!.username} rolled back ${request.departmentName} to pending (was: ${prev.status})`,
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
