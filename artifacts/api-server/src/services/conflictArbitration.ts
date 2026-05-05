import Budget from "../models/Budget.js";
import BudgetRequest from "../models/BudgetRequest.js";

const PRIORITY_WEIGHT: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

export async function detectConflicts(): Promise<void> {
  const budget = await Budget.findOne();
  if (!budget) return;

  const pending = await BudgetRequest.find({
    status: { $in: ["pending", "under_negotiation", "conflicted"] },
  }).sort({ createdAt: 1 });

  let runningTotal = budget.allocatedAmount;

  for (const req of pending) {
    if (runningTotal + req.requestedAmount <= budget.totalBudget) {
      runningTotal += req.requestedAmount;
      if (req.status === "conflicted") {
        req.status = "pending";
        await req.save();
      }
    } else {
      if (req.status !== "under_negotiation") {
        req.status = "conflicted";
        await req.save();
      }
    }
  }
}

export function arbitrate(
  reqA: { priorityLevel: string; createdAt: Date },
  reqB: { priorityLevel: string; createdAt: Date }
): "A" | "B" | "admin" {
  const wA = PRIORITY_WEIGHT[reqA.priorityLevel] ?? 0;
  const wB = PRIORITY_WEIGHT[reqB.priorityLevel] ?? 0;
  if (wA > wB) return "A";
  if (wB > wA) return "B";
  return reqA.createdAt < reqB.createdAt ? "A" : "admin";
}
