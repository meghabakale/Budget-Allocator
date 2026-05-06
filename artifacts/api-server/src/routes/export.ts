import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireLocationAdmin } from "../middleware/roleAuth.js";
import { exportBudget, exportRequests, exportAudit } from "../services/exportService.js";

const router = Router();

router.get("/budget", authenticate, requireLocationAdmin, async (req, res) => {
  const format = (req.query["format"] as string) || "json";
  const { data, contentType } = await exportBudget(format);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename=budget.${format}`);
  res.send(data);
});

router.get("/requests", authenticate, requireLocationAdmin, async (req, res) => {
  const format = (req.query["format"] as string) || "json";
  const { data, contentType } = await exportRequests(format);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename=requests.${format}`);
  res.send(data);
});

router.get("/audit", authenticate, requireLocationAdmin, async (req, res) => {
  const format = (req.query["format"] as string) || "json";
  const { data, contentType } = await exportAudit(format);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename=audit.${format}`);
  res.send(data);
});

export default router;
