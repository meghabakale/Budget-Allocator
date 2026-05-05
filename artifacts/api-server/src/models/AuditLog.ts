import mongoose, { Schema, type Document } from "mongoose";

export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  username: string;
  actionType: string;
  entityId: mongoose.Types.ObjectId | string;
  entityType: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  description: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true },
    actionType: { type: String, required: true },
    entityId: { type: Schema.Types.Mixed, required: true },
    entityType: { type: String, required: true },
    previousState: { type: Schema.Types.Mixed, default: null },
    newState: { type: Schema.Types.Mixed, default: null },
    description: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
