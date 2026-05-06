import { Router } from "express";
import mongoose from "mongoose";
import Budget from "../models/Budget.js";
import BudgetRequest, { type RequestStatus } from "../models/BudgetRequest.js";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { logAction } from "../services/auditService.js";
import { recalculateSystem } from "../services/cascadeRecalculation.js";
import { getIo } from "../sockets/index.js";

const router = Router();

const ADMIN_ROLES = new Set(["admin", "finance_manager", "location_admin"]);

/** Valid status transitions: who can trigger them */
const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  pending: ["under_review", "critical", "approved", "rejected"],
  under_review: ["under_negotiation", "critical", "approved", "rejected", "pending"],
  under_negotiation: ["under_review", "approved", "rejected"],
  critical: ["under_review", "approved", "rejected"],
  conflicted: ["pending_reapproval", "rejected"],
  pending_reapproval: ["approved", "rejected"],
  approved: ["rejected"],
  rejected: ["pending"],
};

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.user!.role !== "admin" && req.user!.role !== "finance_manager") {
      filter["departmentId"] = req.user!.department.toLowerCase();
    }
    const requests = await BudgetRequest.find(filter)
      .populate("requestedBy", "username email")
      .sort({ createdAt: -1 });
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
      allocatedAmount: 0,
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
      description: `Budget request created for ${user.department}: ₹${requestedAmount.toLocaleString("en-IN")} — status: PENDING (awaiting admin review)`,
    });

    const io = getIo();
    if (io) io.emit("REQUEST_CREATED", request);

    res.status(201).json(request);
  } catch {
    res.status(500).json({ error: "Failed to create request" });
  }
});

/**
 * PATCH /api/requests/:id/status
 * Admin-only: Transition a request through the approval lifecycle.
 * Enforces valid transitions, budget check on approval, full audit trail.
 */
router.patch("/:id/status", authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status: newStatus, adminNote, reason } = req.body as {
      status: RequestStatus;
      adminNote?: string;
      reason?: string;
    };

    if (!ADMIN_ROLES.has(req.user!.role)) {
      res.status(403).json({ error: "Only admins can change request status" });
      return;
    }

    const request = await BudgetRequest.findById(id);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }

    const prevStatus = request.status;

    // Validate transition
    const allowed = ALLOWED_TRANSITIONS[prevStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      res.status(400).json({
        error: `Invalid transition: ${prevStatus} → ${newStatus}`,
        allowedTransitions: allowed,
      });
      return;
    }

    // Location admin scope check
    const isGlobal = ["finance_manager", "admin"].includes(req.user!.role);
    if (!isGlobal) {
      const inLocation = request.departmentName.includes(`(${req.user!.location})`);
      if (!inLocation) {
        res.status(403).json({ error: "Cannot manage requests outside your location" });
        return;
      }
    }

    const prev = request.toObject();

    // Budget check on approval
    if (newStatus === "approved") {
      const budget = await Budget.findOne();
      if (!budget) { res.status(500).json({ error: "Budget pool not found" }); return; }

      if (request.requestedAmount > budget.remainingAmount) {
        res.status(409).json({
          error: "Insufficient budget",
          requestedAmount: request.requestedAmount,
          remainingBudget: budget.remainingAmount,
        });
        return;
      }

      request.allocatedAmount = request.requestedAmount;
    } else if (newStatus === "rejected") {
      request.allocatedAmount = 0;
    } else {
      // For non-approve/reject transitions, allocatedAmount stays 0
      request.allocatedAmount = 0;
    }

    request.status = newStatus;
    if (adminNote !== undefined) request.adminNote = adminNote;
    request.version += 1;
    await request.save();

    // Determine action type for audit log
    const actionTypeMap: Partial<Record<RequestStatus, string>> = {
      under_review: "STATUS_UNDER_REVIEW",
      under_negotiation: "STATUS_UNDER_NEGOTIATION",
      critical: "STATUS_MARKED_CRITICAL",
      approved: prevStatus === "pending_reapproval" ? "REAPPROVAL_APPROVED" : "REQUEST_APPROVED",
      rejected: prevStatus === "pending_reapproval" ? "REAPPROVAL_REJECTED" : "REQUEST_REJECTED",
      pending: "STATUS_RESET_TO_PENDING",
      conflicted: "STATUS_CONFLICTED",
      pending_reapproval: "STATUS_PENDING_REAPPROVAL",
    };

    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: actionTypeMap[newStatus] ?? `STATUS_CHANGED_${newStatus.toUpperCase()}`,
      entityId: request._id,
      entityType: "BudgetRequest",
      previousState: { ...prev, previousStatus: prevStatus } as Record<string, unknown>,
      newState: { ...request.toObject(), newStatus } as Record<string, unknown>,
      description: `${req.user!.username} changed ${request.departmentName} status: ${prevStatus} → ${newStatus}${reason ? ` | Reason: ${reason}` : ""}${adminNote ? ` | Note: ${adminNote}` : ""}`,
    });

    const io = getIo();
    if (io) {
      io.emit("REQUEST_STATUS_CHANGED", request);
      if (newStatus === "critical") {
        io.emit("REQUEST_MARKED_CRITICAL", request);
      }
      if (newStatus === "conflicted") {
        io.emit("REQUEST_CONFLICTED", request);
      }
      if (newStatus === "pending_reapproval") {
        io.emit("REQUEST_REQUIRES_REAPPROVAL", request);
      }
    }

    // Trigger recalculation for approval/rejection (budget pool changed)
    if (newStatus === "approved" || newStatus === "rejected") {
      recalculateSystem("CONFLICT_RESOLVED").catch(() => {});
    }

    res.json(request);
  } catch {
    res.status(500).json({ error: "Failed to update request status" });
  }
});

router.put("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { requestedAmount, priorityLevel, justification, version } = req.body;

    const request = await BudgetRequest.findById(id);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }

    if (req.user!.role !== "admin" && req.user!.role !== "finance_manager" && request.departmentId !== req.user!.department.toLowerCase()) {
      res.status(403).json({ error: "Cannot update another department's request" }); return;
    }

    // Only allow editing when request is still pending (not yet under admin review)
    if (req.user!.role === "department_head" && request.status !== "pending") {
      res.status(403).json({ error: "Cannot edit a request that is already under admin review" }); return;
    }

    // Optimistic concurrency check
    if (version !== undefined && request.version !== version) {
      const io = getIo();
      if (io) io.emit("REQUEST_CONFLICTED", request);
      res.status(409).json({ error: "Version conflict detected — another user has modified this request", request });
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
      description: `Budget request updated for ${request.departmentName}: amount=₹${request.requestedAmount.toLocaleString("en-IN")}, priority=${request.priorityLevel}`,
    });

    const io = getIo();
    if (io) io.emit("REQUEST_UPDATED", request);

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

    if (req.user!.role !== "admin" && req.user!.role !== "finance_manager" && request.departmentId !== req.user!.department.toLowerCase()) {
      res.status(403).json({ error: "Cannot delete another department's request" }); return;
    }

    // Only allow deletion of pending or rejected requests
    if (!["pending", "rejected"].includes(request.status)) {
      res.status(403).json({ error: "Can only delete pending or rejected requests" }); return;
    }

    await request.deleteOne();

    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: "REQUEST_DELETED",
      entityId: id as unknown as mongoose.Types.ObjectId,
      entityType: "BudgetRequest",
      previousState: request.toObject() as Record<string, unknown>,
      description: `Budget request deleted for ${request.departmentName} (₹${request.requestedAmount.toLocaleString("en-IN")})`,
    });

    const io = getIo();
    if (io) io.emit("REQUEST_UPDATED", { _id: id, deleted: true });

    recalculateSystem("REQUEST_DELETED").catch(() => {});

    res.json({ message: "Request deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete request" });
  }
});

export default router;
