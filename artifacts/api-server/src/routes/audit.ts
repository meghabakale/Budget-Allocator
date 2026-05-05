import { Router } from "express";
import AuditLog from "../models/AuditLog.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleAuth.js";

const router = Router();

router.get("/", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200);
    res.json(logs);
  } catch {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

export default router;
