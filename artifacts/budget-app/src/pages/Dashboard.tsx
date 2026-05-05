import { useEffect, useState, useCallback } from "react";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { TrendingUp, AlertTriangle, CheckCircle, Clock, DollarSign, Users } from "lucide-react";

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
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color.replace("text-", "bg-").replace("400", "900/50")}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);

  const load = useCallback(async () => {
    const [b, r] = await Promise.all([api.budget.get(), api.requests.list()]);
    setBudget(b as unknown as Budget);
    setRequests(r as unknown as Request[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    const handle = () => load();
    socket.on("BUDGET_UPDATED", (b: Budget) => setBudget(b));
    socket.on("REQUEST_CREATED", handle);
    socket.on("REQUEST_UPDATED", handle);
    socket.on("REQUEST_STATUS_CHANGED", handle);
    return () => {
      socket.off("BUDGET_UPDATED");
      socket.off("REQUEST_CREATED", handle);
      socket.off("REQUEST_UPDATED", handle);
      socket.off("REQUEST_STATUS_CHANGED", handle);
    };
  }, [socket, load]);

  const statusCounts = {
    pending: requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    conflicted: requests.filter((r) => r.status === "conflicted" || r.status === "under_negotiation").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  };

  const allocPercent = budget ? Math.round((budget.allocatedAmount / budget.totalBudget) * 100) : 0;

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-0.5">Welcome back, {user?.username}</p>
          </div>
          <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1.5 rounded-full">
            FY {budget?.fiscalYear || new Date().getFullYear()}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<DollarSign size={18} />} label="Total Budget" value={`$${budget?.totalBudget?.toLocaleString() || 0}`} color="text-blue-400" />
          <StatCard icon={<TrendingUp size={18} />} label="Allocated" value={`$${budget?.allocatedAmount?.toLocaleString() || 0}`} sub={`${allocPercent}% used`} color="text-green-400" />
          <StatCard icon={<Clock size={18} />} label="Remaining" value={`$${budget?.remainingAmount?.toLocaleString() || 0}`} color="text-yellow-400" />
          <StatCard icon={<Users size={18} />} label="Total Requests" value={String(requests.length)} color="text-purple-400" />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white">Budget Utilization</h3>
            <span className="text-sm text-gray-400">{allocPercent}%</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                allocPercent > 90 ? "bg-red-500" : allocPercent > 70 ? "bg-yellow-500" : "bg-blue-500"
              }`}
              style={{ width: `${allocPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>$0</span>
            <span>${budget?.totalBudget?.toLocaleString()}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Pending", count: statusCounts.pending, color: "border-blue-700 text-blue-400" },
            { label: "Approved", count: statusCounts.approved, color: "border-green-700 text-green-400" },
            { label: "Conflicts", count: statusCounts.conflicted, color: "border-yellow-700 text-yellow-400" },
            { label: "Rejected", count: statusCounts.rejected, color: "border-red-700 text-red-400" },
          ].map((s) => (
            <div key={s.label} className={`bg-gray-900 border ${s.color.split(" ")[0]} rounded-xl p-4 text-center`}>
              <p className={`text-3xl font-bold ${s.color.split(" ")[1]}`}>{s.count}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-sm font-medium text-white">Recent Requests</h3>
          </div>
          <div className="divide-y divide-gray-800">
            {requests.slice(0, 5).map((req) => (
              <div key={req._id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">{req.departmentName}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{req.justification}</p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className="text-sm font-semibold text-white">${req.requestedAmount.toLocaleString()}</span>
                  <StatusBadge status={req.status} />
                </div>
              </div>
            ))}
            {requests.length === 0 && (
              <div className="p-8 text-center text-gray-500 text-sm">No requests yet</div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
