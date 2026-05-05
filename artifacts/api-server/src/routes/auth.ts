import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import AdminAllocation from "../models/AdminAllocation.js";
import { logAction } from "../services/auditService.js";

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const { username, email, password, role, department, location } = req.body;
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) { res.status(400).json({ error: "Username or email already exists" }); return; }

    // Auto-assign adminId for department heads based on location
    let adminId: string | undefined;
    const assignedRole = role || "department_head";
    if (assignedRole === "department_head" && location) {
      const locAdmin = await User.findOne({ role: "location_admin", location });
      if (locAdmin) adminId = locAdmin._id.toString();
    }

    const user = await User.create({
      username, email, password,
      role: assignedRole,
      department: department || "",
      location: location || "",
      adminId,
    });

    await logAction({
      userId: user._id,
      username: user.username,
      actionType: "USER_REGISTERED",
      entityId: user._id,
      entityType: "User",
      description: `User ${user.username} registered as ${user.role}${location ? ` (${location})` : ""}`,
    });

    const secret = process.env["JWT_SECRET"] || "fallback-secret";
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role, department: user.department, location: user.location, adminId },
      secret,
      { expiresIn: "7d" }
    );
    res.status(201).json({
      token,
      user: { id: user._id, username: user.username, role: user.role, department: user.department, location: user.location, email: user.email, adminId },
    });
  } catch {
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    if (!user || !(await user.comparePassword(password))) {
      res.status(401).json({ error: "Invalid credentials" }); return;
    }
    await logAction({
      userId: user._id,
      username: user.username,
      actionType: "USER_LOGIN",
      entityId: user._id,
      entityType: "User",
      description: `User ${user.username} (${user.role}) logged in`,
    });
    const secret = process.env["JWT_SECRET"] || "fallback-secret";
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role, department: user.department, location: user.location, adminId: user.adminId?.toString() },
      secret,
      { expiresIn: "7d" }
    );
    res.json({
      token,
      user: { id: user._id, username: user.username, role: user.role, department: user.department, location: user.location, email: user.email, adminId: user.adminId?.toString() },
    });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
