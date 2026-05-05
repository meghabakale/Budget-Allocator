import Budget from "../models/Budget.js";
import BudgetRequest from "../models/BudgetRequest.js";
import { detectConflicts } from "./conflictArbitration.js";

export async function runCascadeRecalculation(): Promise<void> {
  const budget = await Budget.findOne();
  if (!budget) return;

  const approved = await BudgetRequest.find({ status: "approved" });
  const totalAllocated = approved.reduce((sum, r) => sum + r.allocatedAmount, 0);

  budget.allocatedAmount = totalAllocated;
  budget.remainingAmount = budget.totalBudget - totalAllocated;
  await budget.save();

  await detectConflicts();
}
