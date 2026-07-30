import { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";
import Layout from "../components/Layout";
import { exportToCSV, exportToJSON } from "../lib/exportUtils";
import { ClipboardList, Download, Search, AlertTriangle, Loader2 } from "lucide-react";

interface AuditLog {
  _id: string;
  username: string;
  actionType: string;
  entityType: string;
  entityId: string;
  description: string;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  USER_REGISTERED: "text-purple-400",
  USER_LOGIN: "text-blue-400",
  REQUEST_CREATED: "text-green-400",
  REQUEST_UPDATED: "text-yellow-400",
  REQUEST_DELETED: "text-red-400",
  REQUEST_ROLLBACK: "text-orange-400",
  BUDGET_UPDATED: "text-blue-300",
  CONFLICT_APPROVE: "text-green-300",
  CONFLICT_REJECT: "text-red-300",
  CONFLICT_ADJUST: "text-orange-300",
  RECALCULATION: "text-indigo-400",
  FINANCE_WEIGHTED_ALLOCATION: "text-purple-300",
  FINANCE_OVERRIDE_ALLOCATION: "text-violet-400",
  ADMIN_DEMAND_SUBMITTED: "text-cyan-400",
  LOCATION_ADMIN_APPROVE: "text-emerald-400",
  LOCATION_ADMIN_REJECT: "text-red-400",
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.audit.list();
      setLogs(data as unknown as AuditLog[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = logs.filter(
    (l) =>
      !filter ||
      l.username?.toLowerCase().includes(filter.toLowerCase()) ||
      l.actionType?.toLowerCase().includes(filter.toLowerCase()) ||
      l.description?.toLowerCase().includes(filter.toLowerCase())
  );

  const handleExport = (format: "csv" | "json") => {
    if (exportLoading[format]) return;

    const data = filtered.length ? filtered : logs;
    if (!data.length) {
      showToast("No audit log data available to export", false);
      return;
    }

    setExportLoading((p) => ({ ...p, [format]: true }));
    try {
      const rows = data.map((l) => ({
        timestamp: new Date(l.createdAt).toLocaleString("en-IN"),
        username: l.username,
        actionType: l.actionType,
        entityType: l.entityType,
        entityId: l.entityId,
        description: l.description,
      }));

      const ok =
        format === "csv"
          ? exportToCSV(rows as Record<string, unknown>[], "audit-log")
          : exportToJSON(rows, "audit-log");

      if (ok) {
        showToast(`Audit log exported as ${format.toUpperCase()} (${rows.length} entries)`, true);
      } else {
        showToast("No data available to export", false);
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Export failed", false);
    } finally {
      setExportLoading((p) => ({ ...p, [format]: false }));
    }
  };

  return (
    <Layout>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-xl ${
          toast.ok ? "bg-emerald-700 text-white" : "bg-red-700 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <ClipboardList size={22} className="text-blue-400 shrink-0" />
              <span>Audit Logs</span>
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">Complete history of all system actions</p>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            {(["json", "csv"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => handleExport(fmt)}
                disabled={!!exportLoading[fmt] || loading}
                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-xs px-3 py-2 rounded-lg transition-colors border border-gray-700/50"
              >
                {exportLoading[fmt]
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Download size={12} />
                }
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-900/20 border border-red-700/50 rounded-xl">
            <AlertTriangle size={16} className="text-red-400 shrink-0" />
            <div>
              <p className="text-sm text-red-300 font-medium">Failed to load audit logs</p>
              <p className="text-xs text-red-400 mt-0.5">{error}</p>
            </div>
            <button
              onClick={load}
              className="ml-auto text-xs bg-red-800 hover:bg-red-700 text-red-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by user, action, or description…"
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 placeholder-gray-500"
          />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-10 text-center">
              <Loader2 size={24} className="mx-auto mb-2 text-blue-400 animate-spin" />
              <p className="text-sm text-gray-500">Loading audit logs…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px]">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-xs text-gray-500 px-4 py-3 whitespace-nowrap">Time</th>
                    <th className="text-left text-xs text-gray-500 px-4 py-3">User</th>
                    <th className="text-left text-xs text-gray-500 px-4 py-3">Action</th>
                    <th className="text-left text-xs text-gray-500 px-4 py-3">Entity</th>
                    <th className="text-left text-xs text-gray-500 px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.map((log) => (
                    <tr key={log._id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-blue-400">{log.username}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-mono font-medium ${ACTION_COLORS[log.actionType] ?? "text-gray-400"}`}>
                          {log.actionType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-400">{log.entityType}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-300">{log.description}</span>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && !error && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center">
                        <ClipboardList size={24} className="mx-auto mb-2 text-gray-700" />
                        <p className="text-sm text-gray-500">
                          {filter ? "No logs match your search" : "No audit logs yet"}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && !error && (
          <p className="text-xs text-gray-500 text-center">
            {filtered.length} of {logs.length} entries shown
            {filter && filtered.length < logs.length && " (filtered) — export will include only visible entries"}
          </p>
        )}
      </div>
    </Layout>
  );
}
