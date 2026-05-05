import mongoose, { Schema, type Document } from "mongoose";

export interface IAdminAllocation extends Document {
  _id: mongoose.Types.ObjectId;
  adminId: mongoose.Types.ObjectId;
  adminName: string;
  adminUsername: string;
  location: string;
  totalDemand: number;
  allocatedBudget: number;
  usedBudget: number;
  remainingBudget: number;
  priorityScore: number;
  performanceScore: number;
  demandScore: number;
  allocationScore: number;
  updatedAt: Date;
}

const AdminAllocationSchema = new Schema<IAdminAllocation>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    adminName: { type: String, required: true },
    adminUsername: { type: String, required: true },
    location: { type: String, required: true },
    totalDemand: { type: Number, default: 0 },
    allocatedBudget: { type: Number, default: 0 },
    usedBudget: { type: Number, default: 0 },
    remainingBudget: { type: Number, default: 0 },
    priorityScore: { type: Number, default: 5, min: 1, max: 10 },
    performanceScore: { type: Number, default: 0.7, min: 0, max: 1 },
    demandScore: { type: Number, default: 0 },
    allocationScore: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IAdminAllocation>("AdminAllocation", AdminAllocationSchema);
