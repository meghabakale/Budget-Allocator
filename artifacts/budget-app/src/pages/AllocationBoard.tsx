import { useEffect, useState, useCallback } from "react";
import { useSocket } from "../context/SocketContext";
import { api } from "../services/api";
import Layout from "../components/Layout";
import StatusBadge, { PriorityBadge } from "../components/StatusBadge";
import { formatCurrency } from "../lib/currency";
import { Search, X, MapPin, Clock, RefreshCw, Zap, CheckCircle2, AlertTriangle, XCircle, Eye } from "lucide-react";

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
  location: string;
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

const STATUS_GROUPS: Array<{
  key: string;
  label: string;
  statuses: string[];
  border: string;
  badge: string;
  icon: React.ReactNode;
}> = [
  { key: "approved",        label: "Approved",           statuses: ["approved"],           border: "border-green-800",   badge: "bg-green-900/40 text-green-400 border-green-800",   icon: <CheckCircle2 size={13} className="text-green-400" /> },
  { key: "pending",         label: "Pending Review",     statuses: ["pending", "under_review"], border: "border-blue-800",    badge: "bg-blue-900/40 text-blue-400 border-blue-800",      icon: <Eye size={13} className="text-blue-400" /> },
  { key: "critical",        label: "Critical",           statuses: ["critical"],           border: "border-purple-700",  badge: "bg-purple-900/40 text-purple-400 border-purple-700", icon: <Zap size={13} className="text-purple-400" /> },
  { key: "negotiation",     label: "Conflicts / Negotiating", statuses: ["conflicted", "under_negotiation"], border: "border-yellow-800", badge: "bg-yellow-900/40 text-yellow-400 border-yellow-800", icon: <AlertTriangle size={13} className="text-yellow-400" /> },
  { key: "reapproval",      label: "Pending Re-Approval",statuses: ["pending_reapproval"], border: "border-cyan-700",    badge: "bg-cyan-900/40 text-cyan-400 border-cyan-700",       icon: <RefreshCw size={13} className="text-cyan-400" /> },
  { key: "rejected",        label: "Rejected",           statuses: ["rejected"],           border: "border-gray-700",    badge: "bg-gray-800 text-gray-400 border-gray-700",          icon: <XCircle size={13} className="text-gray-400" /> },
];

function DetailModal({ req, onClose }: { req: Request; onClose: () => void }) {
  const fields = [
    { label: "Department", value: req.departmentName },
    { label: "Location", value: req.location || "—" },
    { label: "Requested Amount", value: formatCurrency(req.requestedAmount) },
    { label: "Allocated Amount", value: req.allocatedAmount > 0 ? formatCurrency(req.allocatedAmount) : "—" },
    { label: "Priority", value: <PriorityBadge priority={req.priorityLevel} /> },
    { label: "Status", value: <StatusBadge status={req.status} /> },
    { label: "Submitted", value: new Date(req.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div>
            <h3 className="font-semibold text-white text-lg">{req.departmentName}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Request Detail</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {fields.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-gray-800/60 last:border-0">
              <span className="text-xs text-gray-500">{label}</span>
              <span className="text-sm font-medium text-white">{value as React.ReactNode}</span>
            </div>
          ))}

          <div className="pt-1">
            <p className="text-xs text-gray-500 mb-1">Justification</p>
            <p className="text-sm text-gray-300 bg-gray-800 rounded-lg p-3 leading-relaxed">{req.justification}</p>
          </div>

          {req.adminNote && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Admin Note</p>
              <p className="text-sm text-amber-300 bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 italic">{req.adminNote}</p>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-800">
          <p className="text-xs text-gray-600 text-center">
            This is a read-only view. Use the Location Admin or Requests pages to take action.
          </p>
        </div>
      </div>
    </div>
  );
}

function RequestCard({ req, onClick }: { req: Request; onClick: () => void }) {
  const dotColor = DEPT_COLORS[req.departmentName] || "bg-gray-500";
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg p-3 bg-gray-800 hover:bg-gray-750 hover:ring-1 hover:ring-blue-500/40 transition-all cursor-pointer group"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          <p className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors truncate max-w-[140px]">
            {req.departmentName}
          </p>
        </div>
        <PriorityBadge priority={req.priorityLevel} />
      </div>

      {req.location && (
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1.5">
          <MapPin size={10} />
          <span>{req.location}</span>
        </div>
      )}

      <p className="text-xs text-gray-500 line-clamp-2 mb-2">{req.justification}</p>

      <div className="flex items-center justify-between">
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

      <div className="flex items-center justify-between mt-2">
        <StatusBadge status={req.status} />
        <div className="flex items-center gap-1 text-xs text-gray-600">
          <Clock size={9} />
          <span>{new Date(req.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
        </div>
      </div>
    </button>
  );
}

export default function AllocationBoard() {
  const { socket } = useSocket();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [selectedReq, setSelectedReq] = useState<Request | null>(null);

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

  const approved = requests.filter((r) => r.status === "approved");

  const filtered = requests.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      r.departmentName.toLowerCase().includes(q) ||
      r.justification.toLowerCase().includes(q) ||
      (r.location || "").toLowerCase().includes(q);
    const matchesStatus =
      filterStatus === "all" ||
      STATUS_GROUPS.find((g) => g.key === filterStatus)?.statuses.includes(r.status);
    const matchesPriority = filterPriority === "all" || r.priorityLevel === filterPriority;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  return (
    <Layout>
      {selectedReq && (
        <DetailModal req={selectedReq} onClose={() => setSelectedReq(null)} />
      )}

      <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Allocation Board</h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-0.5">
            Real-time budget monitoring across departments — click any request to view details
          </p>
        </div>

        {/* Budget breakdown bar */}
        {budget && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
              <h3 className="text-xs sm:text-sm font-semibold text-gray-400">Budget Breakdown</h3>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-gray-500 font-mono">
                <span>Total: <span className="text-white font-medium">{formatCurrency(budget.totalBudget)}</span></span>
                <span>Allocated: <span className="text-green-400 font-medium">{formatCurrency(budget.allocatedAmount)}</span></span>
                <span>Remaining: <span className="text-yellow-400 font-medium">{formatCurrency(budget.remainingAmount)}</span></span>
              </div>
            </div>
            <div className="flex h-6 rounded-lg overflow-hidden gap-0.5">
              {approved.map((req) => {
                const pct = (req.allocatedAmount / budget.totalBudget) * 100;
                const color = DEPT_COLORS[req.departmentName] || "bg-gray-600";
                return (
                  <div
                    key={req._id}
                    className={`${color} transition-all duration-500 relative group cursor-pointer`}
                    style={{ width: `${pct}%` }}
                    title={`${req.departmentName}: ${formatCurrency(req.allocatedAmount)}`}
                    onClick={() => setSelectedReq(req)}
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
            <div className="flex flex-wrap gap-2.5 sm:gap-3 mt-3">
              {approved.map((req) => (
                <div key={req._id} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <div className={`w-2 h-2 rounded-sm ${DEPT_COLORS[req.departmentName] || "bg-gray-600"}`} />
                  <span>{req.departmentName}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-2 h-2 rounded-sm bg-gray-700" />
                <span>Remaining</span>
              </div>
            </div>
          </div>
        )}

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search by department, justification, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-8 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 sm:flex-none bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              {STATUS_GROUPS.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </select>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="flex-1 sm:flex-none bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <span className="text-xs text-gray-500 shrink-0 self-end sm:self-center">
            {filtered.length} of {requests.length} requests
          </span>
        </div>

        {/* Status columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {STATUS_GROUPS.map((group) => {
            const items = filtered.filter((r) => group.statuses.includes(r.status));
            return (
              <div key={group.key} className={`bg-gray-900 border ${group.border} rounded-xl flex flex-col`}>
                <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                  <h3 className="text-xs font-medium text-white flex items-center gap-1.5 truncate">
                    {group.icon}
                    <span className="truncate">{group.label}</span>
                  </h3>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full border shrink-0 ${group.badge}`}>
                    {items.length}
                  </span>
                </div>
                <div className="p-2 space-y-2 overflow-y-auto max-h-[380px] sm:max-h-[420px] flex-1">
                  {items.map((req) => (
                    <RequestCard key={req._id} req={req} onClick={() => setSelectedReq(req)} />
                  ))}
                  {items.length === 0 && (
                    <p className="text-xs text-gray-600 text-center py-6">
                      {search || filterStatus !== "all" || filterPriority !== "all" ? "No matches" : "None"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
