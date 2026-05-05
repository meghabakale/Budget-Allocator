import { Router } from "express";
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

/**
 * GET /api/location-admin/departments
 * Returns all department heads under this admin's location.
 */
router.get("/departments", authenticate, requireLocationAdmin, async (req: AuthRequest, res) => {
  try {
    const location = req.user!.location;
    const isGlobal = ["finance_manager", "admin"].includes(req.user!.role);
    const filter = isGlobal ? { role: "department_head" } : { role: "department_head", location };
    const users = await User.find(filter).select("-password").sort({ department: 1 });
    res.json(users);
  } catch {
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

/**
 * GET /api/location-admin/requests
 * Returns all budget requests scoped to this admin's location.
 */
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

/**
 * GET /api/location-admin/summary
 * Returns allocation summary for this admin's location.
 */
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

/**
 * POST /api/location-admin/demand
 * Admin submits aggregated budget demand for their location.
 */
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
      previousState: prev as Record<string, unknown>,
      newState: alloc.toObject() as Record<string, unknown>,
      description: `${req.user!.location} admin submitted demand of $${demandAmount.toLocaleString()}${note ? `: ${note}` : ""}`,
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
 * Location admin approves or rejects a request within their location.
 */
router.post("/resolve/:id", authenticate, requireLocationAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { action, adminNote } = req.body;
    const request = await BudgetRequest.findById(id);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }

    const isGlobal = ["finance_manager", "admin"].includes(req.user!.role);
    const inLocation = request.departmentName.includes(`(${req.user!.location})`);
    if (!isGlobal && !inLocation) {
      res.status(403).json({ error: "Cannot manage requests outside your location" }); return;
    }

    const prev = request.toObject();
    if (action === "approve") {
      request.status = "approved";
      request.allocatedAmount = request.requestedAmount;
    } else {
      request.status = "rejected";
      request.allocatedAmount = 0;
    }
    if (adminNote) request.adminNote = adminNote;
    request.version += 1;
    await request.save();

    await logAction({
      userId: req.user!.id as unknown as mongoose.Types.ObjectId,
      username: req.user!.username,
      actionType: `LOCATION_ADMIN_${action.toUpperCase()}`,
      entityId: request._id,
      entityType: "BudgetRequest",
      previousState: prev as Record<string, unknown>,
      newState: request.toObject() as Record<string, unknown>,
      description: `${req.user!.location} admin ${action}d request for ${request.departmentName}`,
    });

    const io = getIo();
    if (io) io.emit("REQUEST_STATUS_CHANGED", request);

    recalculateSystem("CONFLICT_RESOLVED").catch(() => {});
    res.json(request);
  } catch {
    res.status(500).json({ error: "Failed to resolve request" });
  }
});

export default router;
