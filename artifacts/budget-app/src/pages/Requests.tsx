import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import Layout from "../components/Layout";
import StatusBadge, { PriorityBadge } from "../components/StatusBadge";
import { formatCurrency } from "../lib/currency";
import {
  Plus, Trash2, Edit2, MessageSquare, X, Loader2,
  Clock, Eye, MessageCircle, Zap, CheckCircle2, XCircle,
} from "lucide-react";

interface Request {
  _id: string;
  departmentName: string;
  requestedAmount: number;
  allocatedAmount: number;
  status: string;
  priorityLevel: string;
  justification: string;
  version: number;
  createdAt: string;
  adminNote?: string;
}

const STATUS_TIMELINE: Array<{ status: string; label: string }> = [
  { status: "pending", label: "Submitted" },
  { status: "under_review", label: "Under Review" },
  { status: "under_negotiation", label: "Negotiation" },
  { status: "approved", label: "Approved" },
];

const TERMINAL_STATUSES = new Set(["rejected", "conflicted", "critical", "pending_reapproval"]);

function StatusTimeline({ status }: { status: string }) {
  if (TERMINAL_STATUSES.has(status)) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <StatusBadge status={status} />
      </div>
    );
  }
  const currentIdx = STATUS_TIMELINE.findIndex((s) => s.status === status);
  return (
    <div className="flex items-center gap-1 mt-2">
      {STATUS_TIMELINE.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step.status} className="flex items-center gap-1">
            <div className="flex flex-col items-center">
              <div
                className={`w-2 h-2 rounded-full ${
                  done ? "bg-green-400" : active ? "bg-blue-400 ring-2 ring-blue-400/30" : "bg-gray-700"
                }`}
              />
              <span className={`text-[9px] mt-0.5 whitespace-nowrap ${active ? "text-blue-300" : done ? "text-green-400" : "text-gray-600"}`}>
                {step.label}
              </span>
            </div>
            {idx < STATUS_TIMELINE.length - 1 && (
              <div className={`w-6 h-px mb-3 ${done ? "bg-green-400/50" : "bg-gray-700"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RequestModal({ onClose, onSave, initial }: {
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  initial?: Partial<Request>;
}) {
  const [form, setForm] = useState({
    requestedAmount: initial?.requestedAmount || "",
    priorityLevel: initial?.priorityLevel || "Medium",
    justification: initial?.justification || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onSave({ ...form, requestedAmount: Number(form.requestedAmount) });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="font-semibold text-white">{initial ? "Edit Request" : "New Budget Request"}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Requested Amount (₹)</label>
            <input
              type="number"
              value={form.requestedAmount}
              onChange={(e) => setForm({ ...form, requestedAmount: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="e.g. 500000"
              required min="1"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Priority Level</label>
            <select
              value={form.priorityLevel}
              onChange={(e) => setForm({ ...form, priorityLevel: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Justification</label>
            <textarea
              value={form.justification}
              onChange={(e) => setForm({ ...form, justification: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
              rows={3}
              placeholder="Explain why this budget is needed..."
              required
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {initial ? "Update" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock size={12} className="text-blue-400" />,
  under_review: <Eye size={12} className="text-orange-400" />,
  under_negotiation: <MessageCircle size={12} className="text-yellow-400" />,
  critical: <Zap size={12} className="text-purple-400" />,
  approved: <CheckCircle2 size={12} className="text-green-400" />,
  rejected: <XCircle size={12} className="text-gray-400" />,
};

export default function Requests() {
  const { user, isFinanceManager, isLocationAdmin } = useAuth();
  const { socket } = useSocket();
  const [requests, setRequests] = useState<Request[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Request | undefined>();
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const r = await api.requests.list();
    setRequests(r as unknown as Request[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    socket.on("REQUEST_CREATED", load);
    socket.on("REQUEST_UPDATED", load);
    socket.on("REQUEST_STATUS_CHANGED", load);
    socket.on("REQUEST_CONFLICTED", load);
    socket.on("REQUEST_REQUIRES_REAPPROVAL", load);
    socket.on("REQUEST_MARKED_CRITICAL", load);
    return () => {
      socket.off("REQUEST_CREATED", load);
      socket.off("REQUEST_UPDATED", load);
      socket.off("REQUEST_STATUS_CHANGED", load);
      socket.off("REQUEST_CONFLICTED", load);
      socket.off("REQUEST_REQUIRES_REAPPROVAL", load);
      socket.off("REQUEST_MARKED_CRITICAL", load);
    };
  }, [socket, load]);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const handleCreate = async (data: Record<string, unknown>) => {
    await api.requests.create(data);
    load();
  };

  const handleEdit = async (data: Record<string, unknown>) => {
    if (!editTarget) return;
    await api.requests.update(editTarget._id, { ...data, version: editTarget.version });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this request?")) return;
    try {
      await api.requests.delete(id);
      load();
      showToast("Request deleted", true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Delete failed", false);
    }
  };

  const isAdmin = isFinanceManager || isLocationAdmin;

  // Group requests for admin view
  const criticalRequests = requests.filter((r) => r.status === "critical");
  const pendingReapprovalRequests = requests.filter((r) => r.status === "pending_reapproval");
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const negotiationRequests = requests.filter((r) => r.status === "under_negotiation");
  const otherRequests = requests.filter(
    (r) => !["critical", "pending_reapproval", "pending", "under_negotiation"].includes(r.status)
  );

  return (
    <Layout>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-xl ${toast.ok ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Budget Requests</h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">{user?.department} department</p>
          </div>
          <button
            onClick={() => { setEditTarget(undefined); setShowModal(true); }}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors self-start sm:self-auto"
          >
            <Plus size={16} /> New Request
          </button>
        </div>

        {/* Admin queues */}
        {isAdmin && criticalRequests.length > 0 && (
          <div className="p-3.5 bg-purple-900/20 border border-purple-600/40 rounded-xl">
            <p className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-1">
              Critical — {criticalRequests.length} urgent request(s) requiring immediate attention
            </p>
            {criticalRequests.map((r) => (
              <p key={r._id} className="text-xs text-purple-200">{r.departmentName} — {formatCurrency(r.requestedAmount)}</p>
            ))}
          </div>
        )}

        {isAdmin && pendingReapprovalRequests.length > 0 && (
          <div className="p-3.5 bg-cyan-900/20 border border-cyan-600/40 rounded-xl">
            <p className="text-xs font-semibold text-cyan-300 uppercase tracking-wider mb-1">
              Pending Re-Approval — {pendingReapprovalRequests.length} request(s) with budget now available
            </p>
            <p className="text-xs text-cyan-400/80">Budget is available but explicit admin approval is required.</p>
          </div>
        )}

        {/* Main requests table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs text-gray-500 px-4 py-3">Department</th>
                  <th className="text-left text-xs text-gray-500 px-4 py-3">Requested</th>
                  <th className="text-left text-xs text-gray-500 px-4 py-3">Allocated</th>
                  <th className="text-left text-xs text-gray-500 px-4 py-3">Priority</th>
                  <th className="text-left text-xs text-gray-500 px-4 py-3">Status / Timeline</th>
                  <th className="text-left text-xs text-gray-500 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {requests.map((req) => (
                  <tr
                    key={req._id}
                    className={`hover:bg-gray-800/50 transition-colors ${
                      req.status === "critical" ? "bg-purple-950/20" :
                      req.status === "pending_reapproval" ? "bg-cyan-950/20" :
                      req.status === "under_review" ? "bg-orange-950/10" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-white">{req.departmentName}</p>
                      <p className="text-xs text-gray-500 line-clamp-1 max-w-xs">{req.justification}</p>
                      {req.adminNote && (
                        <p className="text-xs text-amber-400/80 mt-1 flex items-start gap-1">
                          <span className="shrink-0 font-medium">Admin:</span>
                          <span className="italic">{req.adminNote}</span>
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-semibold">{formatCurrency(req.requestedAmount)}</td>
                    <td className="px-4 py-3 text-sm text-green-400 font-semibold">
                      {req.allocatedAmount > 0 ? formatCurrency(req.allocatedAmount) : "—"}
                    </td>
                    <td className="px-4 py-3"><PriorityBadge priority={req.priorityLevel} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {STATUS_ICONS[req.status]}
                        <StatusBadge status={req.status} />
                      </div>
                      <StatusTimeline status={req.status} />
                      {req.status === "pending_reapproval" && (
                        <p className="text-xs text-cyan-400 mt-1">Budget available — awaiting admin approval</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {req.status === "pending" && (
                          <button
                            onClick={() => { setEditTarget(req); setShowModal(true); }}
                            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors"
                            title="Edit request"
                          ><Edit2 size={14} /></button>
                        )}
                        <Link href={`/negotiation/${req._id}`} className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-yellow-900/20 rounded-lg transition-colors inline-flex" title="Open negotiation">
                          <MessageSquare size={14} />
                        </Link>
                        {(req.status === "pending" || req.status === "rejected") && (
                          <button
                            onClick={() => handleDelete(req._id)}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Delete request"
                          ><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">No requests yet. Create your first one!</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary counts for dept heads */}
        {!isAdmin && requests.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Pending", count: pendingRequests.length, color: "text-blue-400" },
              { label: "Negotiation", count: negotiationRequests.length, color: "text-yellow-400" },
              { label: "Approved", count: otherRequests.filter((r) => r.status === "approved").length, color: "text-green-400" },
              { label: "Rejected", count: otherRequests.filter((r) => r.status === "rejected").length, color: "text-gray-400" },
            ].map((s) => (
              <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4 text-center">
                <p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.count}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <RequestModal
          onClose={() => setShowModal(false)}
          onSave={editTarget ? handleEdit : handleCreate}
          initial={editTarget}
        />
      )}
    </Layout>
  );
}
