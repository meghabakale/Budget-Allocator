import AuditLog from "../models/AuditLog.js";
import type mongoose from "mongoose";

export async function logAction(opts: {
  userId: mongoose.Types.ObjectId | string;
  username: string;
  actionType: string;
  entityId: mongoose.Types.ObjectId | string;
  entityType: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  description: string;
}) {
  await AuditLog.create({
    userId: opts.userId,
    username: opts.username,
    actionType: opts.actionType,
    entityId: opts.entityId,
    entityType: opts.entityType,
    previousState: opts.previousState ?? null,
    newState: opts.newState ?? null,
    description: opts.description,
  });
}
