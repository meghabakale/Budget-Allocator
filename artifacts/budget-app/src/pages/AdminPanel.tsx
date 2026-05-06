import { useEffect, useState, useCallback } from "react";
import { useSocket } from "../context/SocketContext";
import { api } from "../services/api";
import Layout from "../components/Layout";
import StatusBadge, { PriorityBadge } from "../components/StatusBadge";
import { formatCurrency } from "../lib/currency";
import { CheckCircle, RotateCcw, IndianRupee, Edit2, X, Loader2, Download } from "lucide-react";

function datestamp() {
  return new Date().toISOString().slice(0, 10);
}

function triggerBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
  version: number;
  adminNote?: string;
  createdAt: string;
}

function ResolveModal({ request, onClose, onDone }: { request: Request; onClose: () => void; onDone: () => void }) {
  const [action, setAction] = useState<"approve" | "reject" | "adjust">("approve");
  const [amount, setAmount] = useState(String(request.requestedAmount));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.conflicts.resolve({
        requestId: request._id,
        action,
        allocatedAmount: action !== "reject" ? Number(amount) : 0,
        adminNote: note,
      });
      onDone();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="font-semibold text-white">Resolve: {request.departmentName}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}
          <div className="p-3 bg-gray-800 rounded-lg text-sm text-gray-300 space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Requested:</span><span className="text-white font-semibold">{formatCurrency(request.requestedAmount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Priority:</span><PriorityBadge priority={request.priorityLevel} /></div>
            <div className="flex justify-between"><span className="text-gray-500">Status:</span><StatusBadge status={request.status} /></div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">Action</label>
            <div className="grid grid-cols-3 gap-2">
              {(["approve", "adjust", "reject"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAction(a)}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors capitalize ${
                    action === a
                      ? a === "approve" ? "bg-green-600 text-white"
                        : a === "reject" ? "bg-red-600 text-white"
                        : "bg-orange-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          {action !== "reject" && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Allocated Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                min="0"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Admin Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
              rows={2}
              placeholder="Provide context for this decision..."
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />}
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const EXPORT_FILENAMES: Record<string, string> = {
  budget: "budget-report",
  requests: "requests-report",
  audit: "audit-log",
};

export default function AdminPanel() {
  const { socket } = useSocket();
  const [requests, setRequests] = useState<Request[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Request | null>(null);
  const [budgetEdit, setBudgetEdit] = useState(false);
  const [newBudget, setNewBudget] = useState("");
  const [exportLoading, setExportLoading] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    const [r, b] = await Promise.all([api.requests.list(), api.budget.get()]);
    setRequests(r as unknown as Request[]);
    setBudget(b as unknown as Budget);
    setNewBudget(String((b as unknown as Budget).totalBudget));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    socket.on("REQUEST_STATUS_CHANGED", load);
    socket.on("REQUEST_CREATED", load);
    socket.on("BUDGET_UPDATED", (b: Budget) => setBudget(b));
    return () => {
      socket.off("REQUEST_STATUS_CHANGED", load);
      socket.off("REQUEST_CREATED", load);
      socket.off("BUDGET_UPDATED");
    };
  }, [socket, load]);

  const doExport = async (type: string, fmt: string) => {
    const key = `${type}-${fmt}`;
    if (exportLoading[key]) return;
    setExportLoading((p) => ({ ...p, [key]: true }));
    try {
      const blob = await api.export.download(type, fmt);
      if (!blob || blob.size === 0) {
        showToast(`No data available to export`, false);
        return;
      }
      const basename = EXPORT_FILENAMES[type] ?? type;
      triggerBlob(blob, `${basename}-${datestamp()}.${fmt}`);
      showToast(`${basename.replace("-", " ")} exported as ${fmt.toUpperCase()}`, true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Export failed", false);
    } finally {
      setExportLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const handleRollback = async (id: string) => {
    if (!confirm("Roll back this request to pending?")) return;
    await api.conflicts.rollback(id);
    load();
  };

  const handleBudgetUpdate = async () => {
    await api.budget.update(Number(newBudget));
    setBudgetEdit(false);
    load();
  };

  const allConflicts = requests.filter((r) => r.status === "conflicted" || r.status === "under_negotiation");

  return (
    <Layout>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-xl transition-all ${
          toast.ok ? "bg-emerald-700 text-white" : "bg-red-700 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
            <p className="text-gray-400 text-sm mt-0.5">Manage budget, resolve conflicts, export data</p>
          </div>
          <div className="flex gap-2">
            {(["budget", "requests", "audit"] as const).map((type) => (
              <div key={type} className="relative group">
                <button className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3 py-2 rounded-lg transition-colors capitalize">
                  <Download size={13} /> Export {type}
                </button>
                <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg py-1 hidden group-hover:block z-10 w-28">
                  {(["json", "csv"] as const).map((fmt) => {
                    const key = `${type}-${fmt}`;
                    const busy = !!exportLoading[key];
                    return (
                      <button
                        key={fmt}
                        onClick={() => doExport(type, fmt)}
                        disabled={busy}
                        className="flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 uppercase disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                        {fmt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Budget Control */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <IndianRupee size={16} className="text-blue-400" /> Budget Control
            </h3>
            {!budgetEdit ? (
              <button onClick={() => setBudgetEdit(true)} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
                <Edit2 size={12} /> Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={newBudget}
                  onChange={(e) => setNewBudget(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white w-36 focus:outline-none focus:border-blue-500"
                />
                <button onClick={handleBudgetUpdate} className="text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded-lg">Save</button>
                <button onClick={() => setBudgetEdit(false)} className="text-xs text-gray-500 hover:text-white px-1">Cancel</button>
              </div>
            )}
          </div>
          {budget && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Budget", value: budget.totalBudget, color: "text-blue-400" },
                { label: "Allocated", value: budget.allocatedAmount, color: "text-green-400" },
                { label: "Remaining", value: budget.remainingAmount, color: "text-yellow-400" },
              ].map((item) => (
                <div key={item.label} className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{item.label}</p>
                  <p className={`text-xl font-bold ${item.color} mt-1`}>{formatCurrency(item.value)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conflicts section */}
        {allConflicts.length > 0 && (
          <div className="bg-gray-900 border border-yellow-800 rounded-xl">
            <div className="p-4 border-b border-gray-800 flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              <h3 className="text-sm font-semibold text-white">Conflicts Requiring Attention</h3>
              <span className="ml-auto text-xs bg-yellow-900/50 text-yellow-300 border border-yellow-700 px-2 py-0.5 rounded-full">{allConflicts.length}</span>
            </div>
            <div className="divide-y divide-gray-800">
              {allConflicts.map((req) => (
                <div key={req._id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{req.departmentName}</p>
                      <PriorityBadge priority={req.priorityLevel} />
                      <StatusBadge status={req.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{req.justification}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Requested: <span className="text-white font-semibold">{formatCurrency(req.requestedAmount)}</span>
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => setResolveTarget(req)}
                      className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Edit2 size={12} /> Resolve
                    </button>
                    <button
                      onClick={() => handleRollback(req._id)}
                      className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <RotateCcw size={12} /> Rollback
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Requests table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white">All Requests</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {["Department", "Requested (₹)", "Allocated (₹)", "Priority", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs text-gray-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {requests.map((req) => (
                  <tr key={req._id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm text-white font-medium">{req.departmentName}</p>
                      <p className="text-xs text-gray-500 max-w-xs line-clamp-1">{req.justification}</p>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-white">{formatCurrency(req.requestedAmount)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-green-400">
                      {req.allocatedAmount > 0 ? formatCurrency(req.allocatedAmount) : "—"}
                    </td>
                    <td className="px-4 py-3"><PriorityBadge priority={req.priorityLevel} /></td>
                    <td className="px-4 py-3"><StatusBadge status={req.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setResolveTarget(req)}
                          className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Resolve"
                        >
                          <CheckCircle size={14} />
                        </button>
                        <button
                          onClick={() => handleRollback(req._id)}
                          className="p-1.5 text-gray-500 hover:text-orange-400 hover:bg-orange-900/20 rounded-lg transition-colors"
                          title="Rollback"
                        >
                          <RotateCcw size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No requests found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {resolveTarget && (
          <ResolveModal
            request={resolveTarget}
            onClose={() => setResolveTarget(null)}
            onDone={load}
          />
        )}
      </div>
    </Layout>
  );
}
