import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { formatCurrency, fmtShort, fmtAxis } from "../lib/currency";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { MapPin, Users, IndianRupee, CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw } from "lucide-react";

interface Request {
  _id: string;
  departmentName: string;
  requestedAmount: number;
  allocatedAmount: number;
  priorityLevel: string;
  status: string;
  justification: string;
  adminNote?: string;
}

interface DeptUser {
  _id: string;
  username: string;
  department: string;
  location: string;
  email: string;
}

interface AllocSummary {
  location: string;
  totalDemand: number;
  allocatedBudget: number;
  usedBudget: number;
  remainingBudget: number;
  priorityScore: number;
  performanceScore: number;
  allocationScore: number;
}

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-900/30 text-emerald-300 border-emerald-700/50",
  rejected: "bg-red-900/30 text-red-300 border-red-700/50",
  conflicted: "bg-yellow-900/30 text-yellow-300 border-yellow-700/50",
  pending: "bg-blue-900/30 text-blue-300 border-blue-700/50",
  under_negotiation: "bg-purple-900/30 text-purple-300 border-purple-700/50",
  pending_reapproval: "bg-orange-900/30 text-orange-300 border-orange-600/50",
};

const STATUS_LABELS: Record<string, string> = {
  pending_reapproval: "Pending Re-Approval",
};

export default function LocationAdminDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [requests, setRequests] = useState<Request[]>([]);
  const [departments, setDepartments] = useState<DeptUser[]>([]);
  const [summary, setSummary] = useState<AllocSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [demandInput, setDemandInput] = useState("");
  const [submittingDemand, setSubmittingDemand] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const [reqs, depts, sum] = await Promise.all([
        api.locationAdmin.requests(),
        api.locationAdmin.departments(),
        api.locationAdmin.summary(),
      ]);
      setRequests(reqs as unknown as Request[]);
      setDepartments(depts as unknown as DeptUser[]);
      const s = Array.isArray(sum)
        ? sum.find((x: AllocSummary) => x.location === user?.location) ?? (sum[0] as unknown as AllocSummary)
        : sum as unknown as AllocSummary;
      setSummary(s);
    } catch {
      showToast("Failed to load data", false);
    } finally {
      setLoading(false);
    }
  }, [user?.location]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    socket.on("REQUEST_STATUS_CHANGED", load);
    socket.on("BUDGET_UPDATED", load);
    socket.on("REQUEST_REQUIRES_REAPPROVAL", load);
    return () => {
      socket.off("REQUEST_STATUS_CHANGED", load);
      socket.off("BUDGET_UPDATED", load);
      socket.off("REQUEST_REQUIRES_REAPPROVAL", load);
    };
  }, [socket, load]);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmitDemand = async () => {
    const amt = parseFloat(demandInput);
    if (isNaN(amt) || amt < 0) { showToast("Enter a valid demand amount", false); return; }
    setSubmittingDemand(true);
    try {
      await api.locationAdmin.submitDemand(amt, "Manual demand submission");
      await load();
      setDemandInput("");
      showToast("Demand submitted to Finance Manager", true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed to submit demand", false);
    } finally {
      setSubmittingDemand(false);
    }
  };

  const handleResolve = async (id: string, action: "approve" | "reject") => {
    setResolving(id + action);
    try {
      await api.locationAdmin.resolve(id, action);
      await load();
      showToast(`Request ${action}d`, true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Action failed", false);
    } finally {
      setResolving(null);
    }
  };

  const barData = [
    { name: "Demand", value: summary?.totalDemand ?? 0, fill: "#f59e0b" },
    { name: "Allocated", value: summary?.allocatedBudget ?? 0, fill: "#6366f1" },
    { name: "Used", value: summary?.usedBudget ?? 0, fill: "#10b981" },
    { name: "Remaining", value: summary?.remainingBudget ?? 0, fill: "#6b7280" },
  ];

  const pendingReapproval = requests.filter((r) => r.status === "pending_reapproval");
  const otherRequests = requests.filter((r) => r.status !== "pending_reapproval");

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="animate-spin text-blue-400" size={32} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-xl ${
          toast.ok ? "bg-emerald-700 text-white" : "bg-red-700 text-white"
        }`}>{toast.msg}</div>
      )}

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <MapPin size={24} className="text-blue-400" />
              {user?.location} Admin Dashboard
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Manage departments and budget requests for {user?.location}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              value={demandInput}
              onChange={(e) => setDemandInput(e.target.value)}
              placeholder="Total demand (₹)"
              className="w-44 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
            <button onClick={handleSubmitDemand} disabled={submittingDemand}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {submittingDemand ? <Loader2 size={14} className="animate-spin" /> : <IndianRupee size={14} />}
              Submit Demand
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Demand", value: fmtShort(summary.totalDemand), color: "text-amber-400", bg: "bg-amber-900/20" },
              { label: "Allocated Budget", value: fmtShort(summary.allocatedBudget), color: "text-blue-400", bg: "bg-blue-900/20" },
              { label: "Used Budget", value: fmtShort(summary.usedBudget), color: "text-emerald-400", bg: "bg-emerald-900/20" },
              { label: "Remaining", value: fmtShort(summary.remainingBudget), color: summary.remainingBudget < 0 ? "text-red-400" : "text-gray-300", bg: "bg-gray-800/50" },
            ].map((c) => (
              <div key={c.label} className={`${c.bg} border border-gray-800 rounded-xl p-4`}>
                <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Allocation scores + chart */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Budget Overview — {user?.location}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtAxis} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 12 }} width={70} />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v)]}
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white">Allocation Scores</h3>
              <div className="space-y-3">
                {[
                  { label: "Priority Score", value: `${summary.priorityScore}/10`, pct: summary.priorityScore / 10, color: "bg-blue-500" },
                  { label: "Performance Score", value: `${(summary.performanceScore * 100).toFixed(0)}%`, pct: summary.performanceScore, color: "bg-emerald-500" },
                  { label: "Weighted Score", value: summary.allocationScore.toFixed(3), pct: summary.allocationScore, color: "bg-purple-500" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{s.label}</span><span className="text-white font-medium">{s.value}</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1.5">
                      <div className={`${s.color} h-1.5 rounded-full transition-all`} style={{ width: `${(s.pct * 100).toFixed(0)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 pt-2">Score = 50%×Priority + 30%×Demand + 20%×Performance</p>
            </div>
          </div>
        )}

        {/* Pending Re-Approval section */}
        {pendingReapproval.length > 0 && (
          <div className="bg-gray-900 border border-orange-700/50 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-orange-800/40 flex items-center justify-between bg-orange-950/20">
              <h3 className="text-sm font-semibold text-orange-300 flex items-center gap-2">
                <RefreshCw size={14} />
                Pending Re-Approval ({pendingReapproval.length})
              </h3>
              <span className="text-xs text-orange-400/80">Budget now available — your approval required</span>
            </div>
            <div className="divide-y divide-orange-900/30">
              {pendingReapproval.map((r) => (
                <div key={r._id} className="p-4 hover:bg-orange-950/10 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white truncate">{r.departmentName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          r.priorityLevel === "High" ? "bg-red-900/30 text-red-300 border-red-700/50" :
                          r.priorityLevel === "Medium" ? "bg-amber-900/30 text-amber-300 border-amber-700/50" :
                          "bg-gray-800 text-gray-400 border-gray-700"
                        }`}>{r.priorityLevel}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES["pending_reapproval"]}`}>
                          Pending Re-Approval
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{r.justification}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Requested: <span className="text-white font-medium">{formatCurrency(r.requestedAmount)}</span>
                        <span className="ml-2 text-orange-400">· Budget available — awaiting your decision</span>
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleResolve(r._id, "approve")}
                        disabled={resolving === r._id + "approve"}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
                        {resolving === r._id + "approve" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Approve
                      </button>
                      <button
                        onClick={() => handleResolve(r._id, "reject")}
                        disabled={resolving === r._id + "reject"}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
                        {resolving === r._id + "reject" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Departments */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Users size={16} className="text-blue-400" />
            Department Heads in {user?.location} ({departments.length})
          </h3>
          {departments.length === 0 ? (
            <p className="text-gray-500 text-sm">No department heads registered for this location yet.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {departments.map((d) => (
                <div key={d._id} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3">
                  <p className="text-sm font-medium text-white">{d.username}</p>
                  <p className="text-xs text-blue-400">{d.department}</p>
                  <p className="text-xs text-gray-500">{d.email}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All Other Requests */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" />
              All Budget Requests — {user?.location}
            </h3>
            <span className="text-xs text-gray-500">{otherRequests.length} requests</span>
          </div>

          {otherRequests.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No requests for this location yet.</div>
          ) : (
            <div className="divide-y divide-gray-800/50">
              {otherRequests.map((r) => (
                <div key={r._id} className="p-4 hover:bg-gray-800/20 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white truncate">{r.departmentName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          r.priorityLevel === "High" ? "bg-red-900/30 text-red-300 border-red-700/50" :
                          r.priorityLevel === "Medium" ? "bg-amber-900/30 text-amber-300 border-amber-700/50" :
                          "bg-gray-800 text-gray-400 border-gray-700"
                        }`}>{r.priorityLevel}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[r.status] ?? "bg-gray-800 text-gray-400 border-gray-700"}`}>
                          {STATUS_LABELS[r.status] ?? r.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{r.justification}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Requested: <span className="text-white">{formatCurrency(r.requestedAmount)}</span>
                        {r.allocatedAmount > 0 && (
                          <> · Allocated: <span className="text-emerald-400">{formatCurrency(r.allocatedAmount)}</span></>
                        )}
                      </p>
                    </div>
                    {(r.status === "pending" || r.status === "conflicted") && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleResolve(r._id, "approve")}
                          disabled={resolving === r._id + "approve"}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
                          {resolving === r._id + "approve" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          Approve
                        </button>
                        <button
                          onClick={() => handleResolve(r._id, "reject")}
                          disabled={resolving === r._id + "reject"}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
                          {resolving === r._id + "reject" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
