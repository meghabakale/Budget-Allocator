import mongoose, { Schema, type Document } from "mongoose";

export type RequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "conflicted"
  | "under_negotiation";

export type PriorityLevel = "High" | "Medium" | "Low";

export interface IBudgetRequest extends Document {
  _id: mongoose.Types.ObjectId;
  departmentId: string;
  departmentName: string;
  location: string;
  requestedBy: mongoose.Types.ObjectId;
  requestedAmount: number;
  allocatedAmount: number;
  priorityLevel: PriorityLevel;
  justification: string;
  status: RequestStatus;
  version: number;
  conflictsWith?: mongoose.Types.ObjectId[];
  adminNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BudgetRequestSchema = new Schema<IBudgetRequest>(
  {
    departmentId: { type: String, required: true },
    departmentName: { type: String, required: true },
    location: { type: String, default: "" },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    requestedAmount: { type: Number, required: true },
    allocatedAmount: { type: Number, default: 0 },
    priorityLevel: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
    justification: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "conflicted", "under_negotiation"],
      default: "pending",
    },
    version: { type: Number, default: 1 },
    conflictsWith: [{ type: Schema.Types.ObjectId, ref: "BudgetRequest" }],
    adminNote: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IBudgetRequest>("BudgetRequest", BudgetRequestSchema);
