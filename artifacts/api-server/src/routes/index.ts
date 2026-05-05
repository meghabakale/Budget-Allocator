import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import budgetRouter from "./budget.js";
import requestsRouter from "./requests.js";
import conflictsRouter from "./conflicts.js";
import negotiationRouter from "./negotiation.js";
import auditRouter from "./audit.js";
import exportRouter from "./export.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/budget", budgetRouter);
router.use("/requests", requestsRouter);
router.use("/conflicts", conflictsRouter);
router.use("/messages", negotiationRouter);
router.use("/audit", auditRouter);
router.use("/export", exportRouter);

export default router;
