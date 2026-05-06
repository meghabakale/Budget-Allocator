import { Router } from "express";
import AuditLog from "../models/AuditLog.js";
import { authenticate } from "../middleware/auth.js";
import { requireLocationAdmin } from "../middleware/roleAuth.js";

const router = Router();

router.get("/", authenticate, requireLocationAdmin, async (_req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(500);
    res.json(logs);
  } catch {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

export default router;
