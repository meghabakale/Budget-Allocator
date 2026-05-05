import Budget from "../models/Budget.js";
import BudgetRequest from "../models/BudgetRequest.js";
import AuditLog from "../models/AuditLog.js";

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
  return lines.join("\n");
}

export async function exportBudget(format: string): Promise<{ data: string; contentType: string }> {
  const budget = await Budget.findOne().lean();
  if (!budget) return { data: "", contentType: "text/plain" };
  const rows = [budget as Record<string, unknown>];
  if (format === "csv") return { data: toCsv(rows), contentType: "text/csv" };
  return { data: JSON.stringify(rows, null, 2), contentType: "application/json" };
}

export async function exportRequests(format: string): Promise<{ data: string; contentType: string }> {
  const requests = await BudgetRequest.find().lean();
  const rows = requests.map((r) => ({
    id: String(r._id),
    department: r.departmentName,
    requestedAmount: r.requestedAmount,
    allocatedAmount: r.allocatedAmount,
    priority: r.priorityLevel,
    status: r.status,
    justification: r.justification,
    createdAt: r.createdAt,
  })) as Record<string, unknown>[];
  if (format === "csv") return { data: toCsv(rows), contentType: "text/csv" };
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
  if (format === "csv") return { data: toCsv(rows), contentType: "text/csv" };
  return { data: JSON.stringify(rows, null, 2), contentType: "application/json" };
}
