import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import Layout from "../components/Layout";
import StatusBadge, { PriorityBadge } from "../components/StatusBadge";
import { Plus, Trash2, Edit2, MessageSquare, X, Check, Loader2 } from "lucide-react";

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
            <label className="block text-xs text-gray-400 mb-1">Requested Amount ($)</label>
            <input
              type="number"
              value={form.requestedAmount}
              onChange={(e) => setForm({ ...form, requestedAmount: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="e.g. 50000"
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

export default function Requests() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [requests, setRequests] = useState<Request[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Request | undefined>();

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
    return () => {
      socket.off("REQUEST_CREATED", load);
      socket.off("REQUEST_UPDATED", load);
      socket.off("REQUEST_STATUS_CHANGED", load);
      socket.off("REQUEST_CONFLICTED", load);
    };
  }, [socket, load]);

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
    await api.requests.delete(id);
    load();
  };

  return (
    <Layout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Budget Requests</h1>
            <p className="text-sm text-gray-400 mt-0.5">{user?.department} department</p>
          </div>
          <button
            onClick={() => { setEditTarget(undefined); setShowModal(true); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Request
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-xs text-gray-500 px-4 py-3">Department</th>
                <th className="text-left text-xs text-gray-500 px-4 py-3">Requested</th>
                <th className="text-left text-xs text-gray-500 px-4 py-3">Allocated</th>
                <th className="text-left text-xs text-gray-500 px-4 py-3">Priority</th>
                <th className="text-left text-xs text-gray-500 px-4 py-3">Status</th>
                <th className="text-left text-xs text-gray-500 px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {requests.map((req) => (
                <tr key={req._id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-white">{req.departmentName}</p>
                    <p className="text-xs text-gray-500 line-clamp-1 max-w-xs">{req.justification}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-white font-semibold">${req.requestedAmount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-green-400 font-semibold">
                    {req.allocatedAmount > 0 ? `$${req.allocatedAmount.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3"><PriorityBadge priority={req.priorityLevel} /></td>
                  <td className="px-4 py-3">
                    <StatusBadge status={req.status} />
                    {req.adminNote && <p className="text-xs text-gray-500 mt-1">{req.adminNote}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {(req.status === "pending" || req.status === "conflicted") && (
                        <button
                          onClick={() => { setEditTarget(req); setShowModal(true); }}
                          className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors"
                        ><Edit2 size={14} /></button>
                      )}
                      <Link href={`/negotiation/${req._id}`}>
                        <a className="p-1.5 text-gray-500 hover:text-purple-400 hover:bg-purple-900/20 rounded-lg transition-colors inline-flex">
                          <MessageSquare size={14} />
                        </a>
                      </Link>
                      {(req.status === "pending" || req.status === "rejected") && (
                        <button
                          onClick={() => handleDelete(req._id)}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
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

        {showModal && (
          <RequestModal
            onClose={() => setShowModal(false)}
            onSave={editTarget ? handleEdit : handleCreate}
            initial={editTarget}
          />
        )}
      </div>
    </Layout>
  );
}
