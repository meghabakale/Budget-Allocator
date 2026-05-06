import { useEffect, useState, useCallback } from "react";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import Layout from "../components/Layout";
import StatusBadge, { PriorityBadge } from "../components/StatusBadge";
import { formatCurrency } from "../lib/currency";
import { RefreshCw, CheckCircle2, XCircle, Loader2, Zap, Eye, MessageCircle } from "lucide-react";

interface Budget {
  totalBudget: number;
  allocatedAmount: number;
  remainingAmount: number;
  fiscalYear: string;
}

interface Request {
  _id: string;
  departmentName: string;
  requestedAmount: number;
  allocatedAmount: number;
  status: string;
  priorityLevel: string;
  justification: string;
  createdAt: string;
  adminNote?: string;
}

const DEPT_COLORS: Record<string, string> = {
  Engineering: "bg-blue-600",
  Marketing: "bg-purple-600",
  Operations: "bg-orange-600",
  HR: "bg-pink-600",
  Administration: "bg-gray-600",
};

export default function AllocationBoard() {
  const { socket } = useSocket();
  const { isFinanceManager, isLocationAdmin } = useAuth();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const [b, r] = await Promise.all([api.budget.get(), api.requests.list()]);
    setBudget(b as unknown as Budget);
    setRequests(r as unknown as Request[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    socket.on("BUDGET_UPDATED", (b: Budget) => setBudget(b));
    socket.on("REQUEST_CREATED", load);
    socket.on("REQUEST_UPDATED", load);
    socket.on("REQUEST_STATUS_CHANGED", load);
    socket.on("REQUEST_REQUIRES_REAPPROVAL", load);
    socket.on("REQUEST_MARKED_CRITICAL", load);
    return () => {
      socket.off("BUDGET_UPDATED");
      socket.off("REQUEST_CREATED", load);
      socket.off("REQUEST_UPDATED", load);
      socket.off("REQUEST_STATUS_CHANGED", load);
      socket.off("REQUEST_REQUIRES_REAPPROVAL", load);
      socket.off("REQUEST_MARKED_CRITICAL", load);
    };
  }, [socket, load]);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const handleStatusChange = async (req: Request, action: string) => {
    setResolving(req._id + action);
    try {
      if (action === "approve" || action === "reject") {
        await api.conflicts.resolve({
          requestId: req._id,
          action,
          allocatedAmount: action === "approve" ? req.requestedAmount : 0,
        });
      } else {
        await api.locationAdmin.resolve(req._id, action);
      }
      await load();
      showToast(
        action === "approve" ? "Request approved" :
        action === "reject" ? "Request rejected" :
        `Status updated to ${action.replace(/_/g, " ")}`,
        true
      );
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Action failed", false);
    } finally {
      setResolving(null);
    }
  };

  const approved = requests.filter((r) => r.status === "approved");
  const pendingReview = requests.filter((r) => ["pending", "under_review"].includes(r.status));
  const critical = requests.filter((r) => r.status === "critical");
  const conflicts = requests.filter((r) => r.status === "conflicted" || r.status === "under_negotiation");
  const pendingReapproval = requests.filter((r) => r.status === "pending_reapproval");

  const canAct = isFinanceManager || isLocationAdmin;

  const RequestCard = ({
    req,
    showApproveReject = false,
    showReviewActions = false,
  }: {
    req: Request;
    showApproveReject?: boolean;
    showReviewActions?: boolean;
  }) => (
    <div className={`rounded-lg p-3 ${
      req.status === "critical" ? "bg-purple-950/40 border border-purple-700/40" :
      req.status === "pending_reapproval" ? "bg-cyan-950/40 border border-cyan-700/40" :
      req.status === "under_review" ? "bg-orange-950/20 border border-orange-800/30" :
      "bg-gray-800"
    }`}>
      <div className="flex items-center justify-between mb-1">
        <div className={`w-2.5 h-2.5 rounded-full ${DEPT_COLORS[req.departmentName] || "bg-gray-500"}`} />
        <PriorityBadge priority={req.priorityLevel} />
      </div>
      <p className="text-sm font-semibold text-white">{req.departmentName}</p>
      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{req.justification}</p>
      <div className="flex items-center justify-between mt-2">
        <div>
          <p className="text-xs text-gray-500">Requested</p>
          <p className="text-sm font-bold text-white">{formatCurrency(req.requestedAmount)}</p>
        </div>
        {req.allocatedAmount > 0 && (
          <div className="text-right">
            <p className="text-xs text-gray-500">Allocated</p>
            <p className="text-sm font-bold text-green-400">{formatCurrency(req.allocatedAmount)}</p>
          </div>
        )}
      </div>
      {req.adminNote && (
        <p className="text-xs text-amber-400/70 mt-1 italic line-clamp-1">"{req.adminNote}"</p>
      )}
      <div className="mt-2">
        <StatusBadge status={req.status} />
      </div>

      {/* Approve / Reject for re-approval and conflict resolution */}
      {showApproveReject && canAct && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => handleStatusChange(req, "approve")}
            disabled={resolving === req._id + "approve"}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
          >
            {resolving === req._id + "approve" ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
            Approve
          </button>
          <button
            onClick={() => handleStatusChange(req, "reject")}
            disabled={resolving === req._id + "reject"}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
          >
            {resolving === req._id + "reject" ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
            Reject
          </button>
        </div>
      )}

      {/* Review queue actions: mark under_review, negotiate, approve, reject */}
      {showReviewActions && canAct && (
        <div className="grid grid-cols-2 gap-1.5 mt-3">
          {req.status === "pending" && (
            <button
              onClick={() => handleStatusChange(req, "under_review")}
              disabled={!!resolving}
              className="col-span-2 flex items-center justify-center gap-1 py-1.5 bg-orange-800/60 hover:bg-orange-700/70 disabled:opacity-50 text-orange-200 text-xs rounded-lg transition-colors"
            >
              <Eye size={11} /> Mark Under Review
            </button>
          )}
          {(req.status === "pending" || req.status === "under_review") && (
            <button
              onClick={() => handleStatusChange(req, "under_negotiation")}
              disabled={!!resolving}
              className="flex items-center justify-center gap-1 py-1.5 bg-yellow-900/50 hover:bg-yellow-800/60 disabled:opacity-50 text-yellow-200 text-xs rounded-lg transition-colors"
            >
              <MessageCircle size={11} /> Negotiate
            </button>
          )}
          <button
            onClick={() => handleStatusChange(req, "approve")}
            disabled={resolving === req._id + "approve"}
            className="flex items-center justify-center gap-1 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
          >
            {resolving === req._id + "approve" ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
            Approve
          </button>
          <button
            onClick={() => handleStatusChange(req, "reject")}
            disabled={resolving === req._id + "reject"}
            className="flex items-center justify-center gap-1 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
          >
            {resolving === req._id + "reject" ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
            Reject
          </button>
        </div>
      )}
    </div>
  );

  // Dynamic column count
  const columnCount = [
    approved.length > 0,
    pendingReview.length > 0 || true,
    critical.length > 0,
    conflicts.length > 0,
    pendingReapproval.length > 0,
  ].filter(Boolean).length;

  return (
    <Layout>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-xl ${toast.ok ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Allocation Board</h1>
          <p className="text-gray-400 text-sm mt-0.5">Real-time budget distribution across departments</p>
        </div>

        {budget && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-4">Budget Breakdown</h3>
            <div className="flex h-8 rounded-lg overflow-hidden gap-0.5">
              {approved.map((req) => {
                const pct = (req.allocatedAmount / budget.totalBudget) * 100;
                const color = DEPT_COLORS[req.departmentName] || "bg-gray-600";
                return (
                  <div
                    key={req._id}
                    className={`${color} transition-all duration-500 relative group cursor-default`}
                    style={{ width: `${pct}%` }}
                    title={`${req.departmentName}: ${formatCurrency(req.allocatedAmount)}`}
                  >
                    <div className="absolute inset-0 hidden group-hover:flex items-center justify-center">
                      <span className="text-xs text-white font-bold">{Math.round(pct)}%</span>
                    </div>
                  </div>
                );
              })}
              <div
                className="bg-gray-700 flex-1 transition-all duration-500"
                title={`Remaining: ${formatCurrency(budget.remainingAmount)}`}
              />
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {approved.map((req) => (
                <div key={req._id} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <div className={`w-2.5 h-2.5 rounded-sm ${DEPT_COLORS[req.departmentName] || "bg-gray-600"}`} />
                  {req.departmentName}
                </div>
              ))}
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-2.5 h-2.5 rounded-sm bg-gray-700" />
                Remaining ({formatCurrency(budget.remainingAmount)})
              </div>
            </div>
          </div>
        )}

        {/* Alert banners */}
        {critical.length > 0 && (
          <div className="flex items-start gap-3 p-4 bg-purple-900/20 border border-purple-600/50 rounded-xl">
            <Zap size={16} className="text-purple-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-purple-300">
                {critical.length} Critical Request(s) — Urgent Admin Attention Required
              </p>
              <p className="text-xs text-purple-400/80 mt-0.5">These high-priority requests need immediate review and approval.</p>
            </div>
          </div>
        )}

        {pendingReapproval.length > 0 && (
          <div className="flex items-start gap-3 p-4 bg-cyan-900/20 border border-cyan-600/50 rounded-xl">
            <RefreshCw size={16} className="text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-cyan-300">
                Budget Now Available — {pendingReapproval.length} Request(s) Awaiting Re-Approval
              </p>
              <p className="text-xs text-cyan-400/80 mt-0.5">
                These requests were previously conflicted. Budget is now available but admin must explicitly approve each one.
              </p>
            </div>
          </div>
        )}

        {/* Board columns */}
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: `repeat(${Math.min(columnCount, 5)}, minmax(0, 1fr))` }}
        >
          {/* Approved */}
          <div className="bg-gray-900 border border-green-800 rounded-xl">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-green-400" /> Approved
              </h3>
              <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-0.5 rounded-full">{approved.length}</span>
            </div>
            <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
              {approved.map((req) => <RequestCard key={req._id} req={req} />)}
              {approved.length === 0 && <p className="text-xs text-gray-600 text-center py-6">None</p>}
            </div>
          </div>

          {/* Pending Review */}
          <div className="bg-gray-900 border border-blue-800 rounded-xl">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white flex items-center gap-1.5">
                <Eye size={13} className="text-orange-400" /> Pending Review
              </h3>
              <span className="text-xs bg-blue-900/40 text-blue-400 border border-blue-800 px-2 py-0.5 rounded-full">{pendingReview.length}</span>
            </div>
            <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
              {pendingReview.map((req) => (
                <RequestCard key={req._id} req={req} showReviewActions />
              ))}
              {pendingReview.length === 0 && <p className="text-xs text-gray-600 text-center py-6">None</p>}
            </div>
          </div>

          {/* Critical — only shown when items exist */}
          {critical.length > 0 && (
            <div className="bg-gray-900 border border-purple-700/50 rounded-xl">
              <div className="p-4 border-b border-purple-800/40 flex items-center justify-between bg-purple-950/20">
                <h3 className="text-sm font-medium text-purple-300 flex items-center gap-1.5">
                  <Zap size={13} /> Critical
                </h3>
                <span className="text-xs bg-purple-900/50 text-purple-300 border border-purple-700/50 px-2 py-0.5 rounded-full">{critical.length}</span>
              </div>
              <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                {critical.map((req) => (
                  <RequestCard key={req._id} req={req} showApproveReject />
                ))}
              </div>
            </div>
          )}

          {/* Conflicts / Negotiating */}
          <div className="bg-gray-900 border border-yellow-800 rounded-xl">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white flex items-center gap-1.5">
                <MessageCircle size={13} className="text-yellow-400" /> Conflicts / Negotiating
              </h3>
              <span className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-800 px-2 py-0.5 rounded-full">{conflicts.length}</span>
            </div>
            <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
              {conflicts.map((req) => (
                <RequestCard key={req._id} req={req} showApproveReject />
              ))}
              {conflicts.length === 0 && <p className="text-xs text-gray-600 text-center py-6">None</p>}
            </div>
          </div>

          {/* Pending Re-Approval — only shown when items exist */}
          {pendingReapproval.length > 0 && (
            <div className="bg-gray-900 border border-cyan-700/50 rounded-xl">
              <div className="p-4 border-b border-cyan-800/40 flex items-center justify-between bg-cyan-950/20">
                <h3 className="text-sm font-medium text-cyan-300 flex items-center gap-1.5">
                  <RefreshCw size={13} /> Pending Re-Approval
                </h3>
                <span className="text-xs bg-cyan-900/50 text-cyan-300 border border-cyan-700/50 px-2 py-0.5 rounded-full">{pendingReapproval.length}</span>
              </div>
              <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                {pendingReapproval.map((req) => (
                  <RequestCard key={req._id} req={req} showApproveReject />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
