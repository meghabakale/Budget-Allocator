import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { formatCurrency, fmtShort, fmtAxis } from "../lib/currency";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  MapPin, Users, IndianRupee, CheckCircle2, XCircle, AlertTriangle, Loader2,
  RefreshCw, Eye, MessageCircle, Zap, Clock,
} from "lucide-react";
import StatusBadge, { PriorityBadge } from "../components/StatusBadge";

interface RequestedBy {
  _id: string;
  username: string;
  email: string;
  location: string;
}

interface Request {
  _id: string;
  departmentName: string;
  requestedAmount: number;
  allocatedAmount: number;
  priorityLevel: string;
  status: string;
  justification: string;
  adminNote?: string;
  requestedBy?: RequestedBy | string;
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

type AdminAction = "approve" | "reject" | "under_review" | "under_negotiation" | "critical";

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
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [reqs, depts, sum] = await Promise.all([
        api.locationAdmin.requests(),
        api.locationAdmin.departments(),
        api.locationAdmin.summary(),
      ]);
      setRequests(reqs as unknown as Request[]);
      setDepartments(depts as unknown as DeptUser[]);
      const sumArr = sum as unknown as AllocSummary[];
      const s = Array.isArray(sum)
        ? sumArr.find((x) => x.location === user?.location) ?? sumArr[0] ?? null
        : (sum as unknown as AllocSummary);
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
    socket.on("REQUEST_MARKED_CRITICAL", load);
    socket.on("REQUEST_CREATED", load);
    return () => {
      socket.off("REQUEST_STATUS_CHANGED", load);
      socket.off("BUDGET_UPDATED", load);
      socket.off("REQUEST_REQUIRES_REAPPROVAL", load);
      socket.off("REQUEST_MARKED_CRITICAL", load);
      socket.off("REQUEST_CREATED", load);
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

  const handleAction = async (id: string, action: AdminAction) => {
    setResolving(id + action);
    try {
      const adminNote = noteInputs[id] || undefined;
      await api.locationAdmin.resolve(id, action, adminNote);
      setNoteInputs((prev) => { const n = { ...prev }; delete n[id]; return n; });
      await load();
      const labels: Record<AdminAction, string> = {
        approve: "Request approved",
        reject: "Request rejected",
        under_review: "Marked as Under Review",
        under_negotiation: "Moved to Negotiation",
        critical: "Marked as Critical",
      };
      showToast(labels[action], true);
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

  // Categorize requests into queues
  const criticalRequests = requests.filter((r) => r.status === "critical");
  const pendingReapproval = requests.filter((r) => r.status === "pending_reapproval");
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const negotiationRequests = requests.filter((r) => r.status === "under_negotiation");
  const underReviewRequests = requests.filter((r) => r.status === "under_review");
  const otherRequests = requests.filter((r) =>
    !["critical", "pending_reapproval", "pending", "under_negotiation", "under_review"].includes(r.status)
  );

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="animate-spin text-blue-400" size={32} />
        </div>
      </Layout>
    );
  }

  const isOwnRequest = (r: Request): boolean => {
    if (!r.requestedBy || !user?.id) return false;
    const byId = typeof r.requestedBy === "string" ? r.requestedBy : r.requestedBy._id;
    return byId === user.id;
  };

  const ActionButtons = ({ r, showReviewBtn = false }: { r: Request; showReviewBtn?: boolean }) => {
    if (isOwnRequest(r)) {
      return (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-purple-900/20 border border-purple-700/40 rounded-lg">
          <Clock size={11} className="text-purple-400" />
          <span className="text-xs text-purple-300 whitespace-nowrap">Awaiting Finance Manager Review</span>
        </div>
      );
    }
    return (
      <div className="space-y-2 shrink-0">
        {noteInputs[r._id] !== undefined && (
          <input
            type="text"
            placeholder="Admin note (optional)"
            value={noteInputs[r._id]}
            onChange={(e) => setNoteInputs((p) => ({ ...p, [r._id]: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
          />
        )}
        <div className="flex flex-wrap gap-1.5">
          {showReviewBtn && r.status === "pending" && (
            <button
              onClick={() => handleAction(r._id, "under_review")}
              disabled={!!resolving}
              className="flex items-center gap-1 px-2 py-1 bg-orange-800/60 hover:bg-orange-700/70 disabled:opacity-50 text-orange-200 text-xs rounded transition-colors"
            >
              <Eye size={10} /> Review
            </button>
          )}
          {(r.status === "pending" || r.status === "under_review") && (
            <button
              onClick={() => handleAction(r._id, "under_negotiation")}
              disabled={!!resolving}
              className="flex items-center gap-1 px-2 py-1 bg-yellow-900/50 hover:bg-yellow-800/60 disabled:opacity-50 text-yellow-200 text-xs rounded transition-colors"
            >
              <MessageCircle size={10} /> Negotiate
            </button>
          )}
          {(r.status === "pending" || r.status === "under_review") && (
            <button
              onClick={() => handleAction(r._id, "critical")}
              disabled={!!resolving}
              className="flex items-center gap-1 px-2 py-1 bg-purple-900/50 hover:bg-purple-800/60 disabled:opacity-50 text-purple-200 text-xs rounded transition-colors"
            >
              <Zap size={10} /> Critical
            </button>
          )}
          <button
            onClick={() => {
              if (noteInputs[r._id] === undefined) {
                setNoteInputs((p) => ({ ...p, [r._id]: "" }));
              } else {
                handleAction(r._id, "approve");
              }
            }}
            disabled={resolving === r._id + "approve"}
            className="flex items-center gap-1 px-2 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs rounded transition-colors"
          >
            {resolving === r._id + "approve" ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
            {noteInputs[r._id] !== undefined ? "Confirm Approve" : "Approve"}
          </button>
          <button
            onClick={() => handleAction(r._id, "reject")}
            disabled={resolving === r._id + "reject"}
            className="flex items-center gap-1 px-2 py-1 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-xs rounded transition-colors"
          >
            {resolving === r._id + "reject" ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />}
            Reject
          </button>
        </div>
      </div>
    );
  };

  const RequestRow = ({ r, showReviewBtn = false }: { r: Request; showReviewBtn?: boolean }) => {
    const own = isOwnRequest(r);
    return (
      <div className={`p-4 hover:bg-gray-800/20 transition-colors ${own ? "bg-purple-950/10" : ""}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-medium text-white truncate">{r.departmentName}</span>
              <PriorityBadge priority={r.priorityLevel} />
              <StatusBadge status={r.status} />
              {own && (
                <span className="text-xs px-1.5 py-0.5 bg-purple-900/40 text-purple-300 border border-purple-700/40 rounded-full">
                  Your Request
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 truncate">{r.justification}</p>
            <p className="text-xs text-gray-500 mt-1">
              Requested: <span className="text-white font-medium">{formatCurrency(r.requestedAmount)}</span>
              {r.allocatedAmount > 0 && (
                <> · Allocated: <span className="text-emerald-400 font-medium">{formatCurrency(r.allocatedAmount)}</span></>
              )}
            </p>
            {r.adminNote && (
              <p className="text-xs text-amber-400/80 mt-0.5 italic">Note: {r.adminNote}</p>
            )}
          </div>
          <ActionButtons r={r} showReviewBtn={showReviewBtn} />
        </div>
      </div>
    );
  };

  const QueueSection = ({
    title, icon, requests: items, color, showReviewBtn = false,
  }: {
    title: string;
    icon: React.ReactNode;
    requests: Request[];
    color: string;
    showReviewBtn?: boolean;
  }) => {
    if (items.length === 0) return null;
    return (
      <div className={`bg-gray-900 border ${color} rounded-xl overflow-hidden`}>
        <div className="p-4 border-b border-gray-800/60 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            {icon}
            {title}
          </h3>
          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{items.length}</span>
        </div>
        <div className="divide-y divide-gray-800/50">
          {items.map((r) => <RequestRow key={r._id} r={r} showReviewBtn={showReviewBtn} />)}
        </div>
      </div>
    );
  };

  return (
    <Layout>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-xl ${
          toast.ok ? "bg-emerald-700 text-white" : "bg-red-700 text-white"
        }`}>{toast.msg}</div>
      )}

      <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <MapPin size={24} className="text-blue-400 shrink-0" />
              <span>{user?.location} Admin Dashboard</span>
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm mt-0.5">
              Manage departments and budget requests for {user?.location}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="number"
              value={demandInput}
              onChange={(e) => setDemandInput(e.target.value)}
              placeholder="Total demand (₹)"
              className="flex-1 sm:w-44 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
            <button onClick={handleSubmitDemand} disabled={submittingDemand}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shrink-0">
              {submittingDemand ? <Loader2 size={14} className="animate-spin" /> : <IndianRupee size={14} />}
              <span>Submit Demand</span>
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              { label: "Total Demand", value: fmtShort(summary.totalDemand), color: "text-amber-400", bg: "bg-amber-900/20" },
              { label: "Allocated Budget", value: fmtShort(summary.allocatedBudget), color: "text-blue-400", bg: "bg-blue-900/20" },
              { label: "Used Budget", value: fmtShort(summary.usedBudget), color: "text-emerald-400", bg: "bg-emerald-900/20" },
              { label: "Remaining", value: fmtShort(summary.remainingBudget), color: summary.remainingBudget < 0 ? "text-red-400" : "text-gray-300", bg: "bg-gray-800/50" },
            ].map((c) => (
              <div key={c.label} className={`${c.bg} border border-gray-800 rounded-xl p-3.5 sm:p-4`}>
                <p className="text-xs text-gray-400 mb-1 truncate">{c.label}</p>
                <p className={`text-lg sm:text-xl font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Chart + scores */}
        {summary && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
              <h3 className="text-xs sm:text-sm font-semibold text-white mb-4">Budget Overview — {user?.location}</h3>
              <div className="w-full overflow-x-auto">
                <ResponsiveContainer width="100%" height={200} minWidth={280}>
                  <BarChart data={barData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtAxis} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} width={65} />
                    <Tooltip
                      formatter={(v: number) => [formatCurrency(v)]}
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold text-white">Allocation Scores</h3>
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
              <p className="text-xs text-gray-500 pt-2">Score = 50%×Priority + 30%×Demand + 20%×Performance</p>
            </div>
          </div>
        )}

        {/* ── Admin Action Queues ── */}

        {/* 1. Critical */}
        <QueueSection
          title="Critical Requests — Urgent Action Required"
          icon={<Zap size={14} className="text-purple-400" />}
          requests={criticalRequests}
          color="border-purple-700/50"
        />

        {/* 2. Pending Re-Approval */}
        <QueueSection
          title="Re-Approval Queue — Budget Now Available"
          icon={<RefreshCw size={14} className="text-cyan-400" />}
          requests={pendingReapproval}
          color="border-cyan-700/50"
        />

        {/* 3. Negotiation Queue */}
        <QueueSection
          title="Negotiation Queue"
          icon={<MessageCircle size={14} className="text-yellow-400" />}
          requests={negotiationRequests}
          color="border-yellow-700/50"
        />

        {/* 4. Under Review */}
        <QueueSection
          title="Under Review"
          icon={<Eye size={14} className="text-orange-400" />}
          requests={underReviewRequests}
          color="border-orange-700/50"
        />

        {/* 5. Pending Requests */}
        <QueueSection
          title="Pending Requests — Awaiting Admin Review"
          icon={<Clock size={14} className="text-blue-400" />}
          requests={pendingRequests}
          color="border-blue-700/50"
          showReviewBtn
        />

        {/* Departments */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
          <h3 className="text-xs sm:text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Users size={16} className="text-blue-400" />
            <span>Department Heads in {user?.location} ({departments.length})</span>
          </h3>
          {departments.length === 0 ? (
            <p className="text-gray-500 text-sm">No department heads registered for this location yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {departments.map((d) => (
                <div key={d._id} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3">
                  <p className="text-sm font-medium text-white">{d.username}</p>
                  <p className="text-xs text-blue-400">{d.department}</p>
                  <p className="text-xs text-gray-500 truncate">{d.email}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Other requests (approved/rejected) */}
        {otherRequests.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-semibold text-white flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                <span>Resolved Requests — {user?.location}</span>
              </h3>
              <span className="text-xs text-gray-500">{otherRequests.length} requests</span>
            </div>
            <div className="divide-y divide-gray-800/50">
              {otherRequests.map((r) => (
                <div key={r._id} className="p-4 hover:bg-gray-800/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{r.departmentName}</span>
                        <PriorityBadge priority={r.priorityLevel} />
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatCurrency(r.requestedAmount)} requested
                        {r.allocatedAmount > 0 && <> · <span className="text-emerald-400">{formatCurrency(r.allocatedAmount)}</span> allocated</>}
                      </p>
                      {r.adminNote && <p className="text-xs text-amber-400/70 mt-0.5 italic">{r.adminNote}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
