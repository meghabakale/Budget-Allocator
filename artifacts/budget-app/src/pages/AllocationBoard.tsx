import { useEffect, useState, useCallback } from "react";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import Layout from "../components/Layout";
import StatusBadge, { PriorityBadge } from "../components/StatusBadge";
import { formatCurrency } from "../lib/currency";
import { RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";

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
    return () => {
      socket.off("BUDGET_UPDATED");
      socket.off("REQUEST_CREATED", load);
      socket.off("REQUEST_UPDATED", load);
      socket.off("REQUEST_STATUS_CHANGED", load);
      socket.off("REQUEST_REQUIRES_REAPPROVAL", load);
    };
  }, [socket, load]);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const handleReapproval = async (req: Request, action: "approve" | "reject") => {
    setResolving(req._id + action);
    try {
      await api.conflicts.resolve({
        requestId: req._id,
        action,
        allocatedAmount: action === "approve" ? req.requestedAmount : 0,
      });
      await load();
      showToast(`Request ${action}d`, true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Action failed", false);
    } finally {
      setResolving(null);
    }
  };

  const approved = requests.filter((r) => r.status === "approved");
  const pending = requests.filter((r) => r.status === "pending");
  const conflicts = requests.filter((r) => r.status === "conflicted" || r.status === "under_negotiation");
  const pendingReapproval = requests.filter((r) => r.status === "pending_reapproval");

  const canActOnReapproval = isFinanceManager || isLocationAdmin;

  const RequestCard = ({ req, showReapprovalActions = false }: { req: Request; showReapprovalActions?: boolean }) => (
    <div className={`rounded-lg p-3 ${req.status === "pending_reapproval" ? "bg-orange-950/40 border border-orange-700/40" : "bg-gray-800"}`}>
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
      <div className="mt-2">
        <StatusBadge status={req.status} />
      </div>
      {showReapprovalActions && canActOnReapproval && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => handleReapproval(req, "approve")}
            disabled={resolving === req._id + "approve"}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
          >
            {resolving === req._id + "approve" ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
            Approve
          </button>
          <button
            onClick={() => handleReapproval(req, "reject")}
            disabled={resolving === req._id + "reject"}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
          >
            {resolving === req._id + "reject" ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
            Reject
          </button>
        </div>
      )}
    </div>
  );

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

        {/* Pending Re-Approval banner */}
        {pendingReapproval.length > 0 && (
          <div className="flex items-start gap-3 p-4 bg-orange-900/20 border border-orange-600/50 rounded-xl">
            <RefreshCw size={16} className="text-orange-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-300">
                Budget Now Available — {pendingReapproval.length} Request(s) Awaiting Admin Approval
              </p>
              <p className="text-xs text-orange-400/80 mt-0.5">
                These requests were previously conflicted and now fit within the budget. Admin must explicitly approve or reject each one — no automatic approval.
              </p>
            </div>
          </div>
        )}

        <div className={`grid grid-cols-1 gap-6 ${pendingReapproval.length > 0 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {/* Pending Re-Approval column — shown only when there are items */}
          {pendingReapproval.length > 0 && (
            <div className="bg-gray-900 border border-orange-700/50 rounded-xl">
              <div className="p-4 border-b border-orange-800/40 flex items-center justify-between">
                <h3 className="text-sm font-medium text-orange-300 flex items-center gap-1.5">
                  <RefreshCw size={13} />
                  Pending Re-Approval
                </h3>
                <span className="text-xs bg-orange-900/50 text-orange-300 border border-orange-700/50 px-2 py-0.5 rounded-full">{pendingReapproval.length}</span>
              </div>
              <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                {pendingReapproval.map((req) => (
                  <RequestCard key={req._id} req={req} showReapprovalActions />
                ))}
              </div>
            </div>
          )}

          {[
            { title: "Approved", items: approved, color: "border-green-800" },
            { title: "Pending Review", items: pending, color: "border-blue-800" },
            { title: "Conflicts / Negotiating", items: conflicts, color: "border-yellow-800" },
          ].map(({ title, items, color }) => (
            <div key={title} className={`bg-gray-900 border ${color} rounded-xl`}>
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">{title}</h3>
                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{items.length}</span>
              </div>
              <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                {items.map((req) => (
                  <RequestCard key={req._id} req={req} />
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-6">None</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
