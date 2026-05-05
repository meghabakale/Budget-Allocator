import mongoose, { Schema, type Document } from "mongoose";

export interface IBudget extends Document {
  _id: mongoose.Types.ObjectId;
  totalBudget: number;
  allocatedAmount: number;
  remainingAmount: number;
  fiscalYear: string;
  updatedAt: Date;
}

const BudgetSchema = new Schema<IBudget>(
  {
    totalBudget: { type: Number, required: true, default: 1000000 },
    allocatedAmount: { type: Number, default: 0 },
    remainingAmount: { type: Number, default: 1000000 },
    fiscalYear: { type: String, default: new Date().getFullYear().toString() },
  },
  { timestamps: true }
);

export default mongoose.model<IBudget>("Budget", BudgetSchema);
