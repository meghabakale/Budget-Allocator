import { Router } from "express";
import mongoose from "mongoose";
import NegotiationMessage from "../models/NegotiationMessage.js";
import BudgetRequest from "../models/BudgetRequest.js";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { getIo } from "../sockets/index.js";

const router = Router();

router.get("/:requestId", authenticate, async (req, res) => {
  try {
    const messages = await NegotiationMessage.find({ requestId: req.params.requestId }).sort({ createdAt: 1 });
    res.json(messages);
  } catch {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { requestId, message } = req.body;
    const request = await BudgetRequest.findById(requestId);
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }
    const msg = await NegotiationMessage.create({
      requestId: new mongoose.Types.ObjectId(requestId),
      senderId: new mongoose.Types.ObjectId(req.user!.id),
      senderName: req.user!.username,
      senderRole: req.user!.role,
      message,
    });
    if (request.status === "pending" || request.status === "conflicted") {
      request.status = "under_negotiation";
      await request.save();
    }
    const io = getIo();
    if (io) io.emit("NEGOTIATION_MESSAGE", msg);
    res.status(201).json(msg);
  } catch {
    res.status(500).json({ error: "Failed to send message" });
  }
});

export default router;
