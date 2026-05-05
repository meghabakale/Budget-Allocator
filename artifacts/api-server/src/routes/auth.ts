import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { logAction } from "../services/auditService.js";

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const { username, email, password, role, department } = req.body;
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      res.status(400).json({ error: "Username or email already exists" });
      return;
    }
    const user = await User.create({ username, email, password, role: role || "department_head", department });
    await logAction({
      userId: user._id,
      username: user.username,
      actionType: "USER_REGISTERED",
      entityId: user._id,
      entityType: "User",
      description: `User ${user.username} registered`,
    });
    const secret = process.env["JWT_SECRET"] || "fallback-secret";
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role, department: user.department },
      secret,
      { expiresIn: "7d" }
    );
    res.status(201).json({ token, user: { id: user._id, username: user.username, role: user.role, department: user.department } });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    if (!user || !(await user.comparePassword(password))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    await logAction({
      userId: user._id,
      username: user.username,
      actionType: "USER_LOGIN",
      entityId: user._id,
      entityType: "User",
      description: `User ${user.username} logged in`,
    });
    const secret = process.env["JWT_SECRET"] || "fallback-secret";
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role, department: user.department },
      secret,
      { expiresIn: "7d" }
    );
    res.json({ token, user: { id: user._id, username: user.username, role: user.role, department: user.department, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
