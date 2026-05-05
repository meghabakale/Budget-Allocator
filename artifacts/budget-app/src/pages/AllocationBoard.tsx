import { useEffect, useState, useCallback } from "react";
import { useSocket } from "../context/SocketContext";
import { api } from "../services/api";
import Layout from "../components/Layout";
import StatusBadge, { PriorityBadge } from "../components/StatusBadge";

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

const DEPT_COLORS: Record<string, string> = {
  Engineering: "bg-blue-600",
  Marketing: "bg-purple-600",
  Operations: "bg-orange-600",
  HR: "bg-pink-600",
  Administration: "bg-gray-600",
};

export default function AllocationBoard() {
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
    socket.on("BUDGET_UPDATED", (b: Budget) => setBudget(b));
    socket.on("REQUEST_CREATED", load);
    socket.on("REQUEST_UPDATED", load);
    socket.on("REQUEST_STATUS_CHANGED", load);
    return () => {
      socket.off("BUDGET_UPDATED");
      socket.off("REQUEST_CREATED", load);
      socket.off("REQUEST_UPDATED", load);
      socket.off("REQUEST_STATUS_CHANGED", load);
    };
  }, [socket, load]);

  const approved = requests.filter((r) => r.status === "approved");
  const pending = requests.filter((r) => r.status === "pending");
  const conflicts = requests.filter((r) => r.status === "conflicted" || r.status === "under_negotiation");

  return (
    <Layout>
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
                    title={`${req.departmentName}: $${req.allocatedAmount.toLocaleString()}`}
                  >
                    <div className="absolute inset-0 hidden group-hover:flex items-center justify-center">
                      <span className="text-xs text-white font-bold">{Math.round(pct)}%</span>
                    </div>
                  </div>
                );
              })}
              <div
                className="bg-gray-700 flex-1 transition-all duration-500"
                title={`Remaining: $${budget.remainingAmount.toLocaleString()}`}
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
                Remaining (${budget.remainingAmount.toLocaleString()})
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  <div key={req._id} className="bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className={`w-2.5 h-2.5 rounded-full ${DEPT_COLORS[req.departmentName] || "bg-gray-500"}`} />
                      <PriorityBadge priority={req.priorityLevel} />
                    </div>
                    <p className="text-sm font-semibold text-white">{req.departmentName}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{req.justification}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div>
                        <p className="text-xs text-gray-500">Requested</p>
                        <p className="text-sm font-bold text-white">${req.requestedAmount.toLocaleString()}</p>
                      </div>
                      {req.allocatedAmount > 0 && (
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Allocated</p>
                          <p className="text-sm font-bold text-green-400">${req.allocatedAmount.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    <div className="mt-2">
                      <StatusBadge status={req.status} />
                    </div>
                  </div>
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
