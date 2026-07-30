import { Router } from "express";
import Budget from "../models/Budget.js";
import BudgetRequest from "../models/BudgetRequest.js";
import User from "../models/User.js";
import AdminAllocation from "../models/AdminAllocation.js";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { requireLocationAdmin } from "../middleware/roleAuth.js";
import { logAction } from "../services/auditService.js";
import { recalculateSystem } from "../services/cascadeRecalculation.js";
import { getIo } from "../sockets/index.js";
import mongoose from "mongoose";

const router = Router();

router.get("/departments", authenticate, requireLocationAdmin, async (req: AuthRequest, res) => {
  try {
    const location = req.user!.location;
    const isGlobal = ["finance_manager", "admin"].includes(req.user!.role);
    const filter = isGlobal ? { role: "department_head" } : { role: "department_head", location };
    const users = await User.find(filter as any).select("-password").sort({ department: 1 });
    res.json(users);
  } catch {
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

router.get("/requests", authenticate, requireLocationAdmin, async (req: AuthRequest, res) => {
  try {
    const location = req.user!.location;
    const isGlobal = ["finance_manager", "admin"].includes(req.user!.role);
    const filter = isGlobal
      ? {}
      : { departmentName: { $regex: new RegExp(`\\(${location}\\)`, "i") } };
    const requests = await BudgetRequest.find(filter)
      .populate("requestedBy", "username email location")
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch {
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

router.get("/summary", authenticate, requireLocationAdmin, async (req: AuthRequest, res) => {
  try {
    const location = req.user!.location;
    const isGlobal = ["finance_manager", "admin"].includes(req.user!.role);

    if (isGlobal) {
      const all = await AdminAllocation.find().sort({ priorityScore: -1 });
      res.json(all);
      return;
    }

    const myUser = await User.findById(req.user!.id);
    const alloc = await AdminAllocation.findOne({ adminId: myUser?._id });
    res.json(alloc ?? { message: "No allocation record found" });
  } catch {
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

router.post("/demand", authenticate, requireLocationAdmin, async (req: AuthRequest, res) => {
  try {
    const { demandAmount, note } = req.body;
    const myUser = await User.findById(req.user!.id);
    if (!myUser) { res.status(404).json({ error: "User not found" }); return; }

    const alloc = await AdminAllocation.findOne({ adminId: myUser._id });
    if (!alloc) { res.status(404).json({ error: "Allocation record not found" }); return; }

    const prev = alloc.toObject();
    alloc.totalDemand = demandAmount;
    await alloc.save();

    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: "ADMIN_DEMAND_SUBMITTED",
      entityId: alloc._id,
      entityType: "AdminAllocation",
      previousState: prev as unknown as Record<string, unknown>,
      newState: alloc.toObject() as unknown as Record<string, unknown>,
      description: `${req.user!.location} admin submitted demand of ₹${demandAmount.toLocaleString("en-IN")}${note ? `: ${note}` : ""}`,
    });

    const io = getIo();
    if (io) io.emit("ADMIN_DEMAND_UPDATED", alloc);

    res.json(alloc);
  } catch {
    res.status(500).json({ error: "Failed to submit demand" });
  }
});

/**
 * POST /api/location-admin/resolve/:id
 * Location admin approves, rejects, marks under_review, under_negotiation, or critical.
 * Budget availability is checked before any approval.
 */
router.post("/resolve/:id", authenticate, requireLocationAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { action, adminNote, reason } = req.body;
    const request = await BudgetRequest.findById(id);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }

    const isGlobal = ["finance_manager", "admin"].includes(req.user!.role);
    const inLocation = request.departmentName.includes(`(${req.user!.location})`);
    if (!isGlobal && !inLocation) {
      res.status(403).json({ error: "Cannot manage requests outside your location" }); return;
    }

    // Self-approval prevention: location admins cannot act on their own requests
    if (!isGlobal && request.requestedBy.toString() === req.user!.id) {
      res.status(403).json({ error: "Admins cannot approve, reject, or modify their own requests. These must be reviewed by the Finance Manager." }); return;
    }

    const prev = request.toObject();
    const prevStatus = request.status;

    switch (action) {
      case "approve": {
        const budget = await Budget.findOne();
        if (!budget) { res.status(500).json({ error: "Budget pool not found" }); return; }
        if (request.requestedAmount > budget.remainingAmount) {
          res.status(409).json({
            error: "Insufficient budget to approve this request",
            requestedAmount: request.requestedAmount,
            remainingBudget: budget.remainingAmount,
          });
          return;
        }
        request.status = "approved";
        request.allocatedAmount = request.requestedAmount;
        break;
      }
      case "reject":
        request.status = "rejected";
        request.allocatedAmount = 0;
        break;
      case "under_review":
        request.status = "under_review";
        request.allocatedAmount = 0;
        break;
      case "under_negotiation":
        request.status = "under_negotiation";
        request.allocatedAmount = 0;
        break;
      case "critical":
        request.status = "critical";
        request.allocatedAmount = 0;
        break;
      default:
        res.status(400).json({ error: `Unknown action: ${action}` }); return;
    }

    if (adminNote) request.adminNote = adminNote;
    request.version += 1;
    await request.save();

    const actionTypeMap: Record<string, string> = {
      approve: prevStatus === "pending_reapproval" ? "REAPPROVAL_APPROVED" : "REQUEST_APPROVED",
      reject: prevStatus === "pending_reapproval" ? "REAPPROVAL_REJECTED" : "REQUEST_REJECTED",
      under_review: "STATUS_UNDER_REVIEW",
      under_negotiation: "STATUS_UNDER_NEGOTIATION",
      critical: "STATUS_MARKED_CRITICAL",
    };

    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: actionTypeMap[action] ?? `LOCATION_ADMIN_${action.toUpperCase()}`,
      entityId: request._id,
      entityType: "BudgetRequest",
      previousState: { ...prev, previousStatus: prevStatus } as Record<string, unknown>,
      newState: { ...request.toObject(), newStatus: request.status } as Record<string, unknown>,
      description: `${req.user!.username} (${req.user!.location}) changed ${request.departmentName}: ${prevStatus} → ${request.status}${reason ? ` | Reason: ${reason}` : ""}${adminNote ? ` | Note: ${adminNote}` : ""}`,
    });

    const io = getIo();
    if (io) {
      io.emit("REQUEST_STATUS_CHANGED", request);
      if (request.status === "critical") {
        io.emit("REQUEST_MARKED_CRITICAL", request);
      }
    }

    if (action === "approve" || action === "reject") {
      recalculateSystem("CONFLICT_RESOLVED").catch(() => {});
    }

    res.json(request);
  } catch {
    res.status(500).json({ error: "Failed to resolve request" });
  }
});

export default router;
