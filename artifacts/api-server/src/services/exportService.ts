import Budget from "../models/Budget.js";
import BudgetRequest from "../models/BudgetRequest.js";
import AuditLog from "../models/AuditLog.js";

/** Format number as Indian Rupee string for exports */
function fmtINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = row[h];
          const str = v === null || v === undefined ? "" : String(v);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(",")
    );
  }
  return "\uFEFF" + lines.join("\n"); // BOM for Excel UTF-8 ₹ compatibility
}

export async function exportBudget(format: string): Promise<{ data: string; contentType: string }> {
  const budget = await Budget.findOne().lean();
  if (!budget) return { data: "", contentType: "text/plain" };

  if (format === "csv") {
    const rows = [{
      totalBudget: budget.totalBudget,
      totalBudget_formatted: fmtINR(budget.totalBudget),
      allocatedAmount: budget.allocatedAmount,
      allocatedAmount_formatted: fmtINR(budget.allocatedAmount),
      remainingAmount: budget.remainingAmount,
      remainingAmount_formatted: fmtINR(budget.remainingAmount),
    }] as Record<string, unknown>[];
    return { data: toCsv(rows), contentType: "text/csv; charset=utf-8" };
  }

  const row = {
    ...(budget as unknown as Record<string, unknown>),
    totalBudget_formatted: fmtINR(budget.totalBudget),
    allocatedAmount_formatted: fmtINR(budget.allocatedAmount),
    remainingAmount_formatted: fmtINR(budget.remainingAmount),
  };
  return { data: JSON.stringify([row], null, 2), contentType: "application/json" };
}

export async function exportRequests(format: string): Promise<{ data: string; contentType: string }> {
  const requests = await BudgetRequest.find().lean();

  if (format === "csv") {
    const rows = requests.map((r) => ({
      id: String(r._id),
      department: r.departmentName,
      location: r.location,
      requestedAmount: r.requestedAmount,
      requestedAmount_INR: fmtINR(r.requestedAmount),
      allocatedAmount: r.allocatedAmount,
      allocatedAmount_INR: fmtINR(r.allocatedAmount),
      priority: r.priorityLevel,
      status: r.status,
      justification: r.justification,
      adminNote: r.adminNote ?? "",
      createdAt: r.createdAt,
    })) as Record<string, unknown>[];
    return { data: toCsv(rows), contentType: "text/csv; charset=utf-8" };
  }

  const rows = requests.map((r) => ({
    id: String(r._id),
    department: r.departmentName,
    location: r.location,
    requestedAmount: r.requestedAmount,
    requestedAmount_formatted: fmtINR(r.requestedAmount),
    allocatedAmount: r.allocatedAmount,
    allocatedAmount_formatted: fmtINR(r.allocatedAmount),
    priority: r.priorityLevel,
    status: r.status,
    justification: r.justification,
    adminNote: r.adminNote ?? "",
    createdAt: r.createdAt,
  }));
  return { data: JSON.stringify(rows, null, 2), contentType: "application/json" };
}

export async function exportAudit(format: string): Promise<{ data: string; contentType: string }> {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).lean();
  const rows = logs.map((l) => ({
    id: String(l._id),
    username: l.username,
    actionType: l.actionType,
    entityType: l.entityType,
    entityId: String(l.entityId),
    description: l.description,
    createdAt: l.createdAt,
  })) as Record<string, unknown>[];
  if (format === "csv") return { data: toCsv(rows), contentType: "text/csv; charset=utf-8" };
  return { data: JSON.stringify(rows, null, 2), contentType: "application/json" };
}
