import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { api } from "../services/api";
import { useSocket } from "../context/SocketContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  TrendingUp, DollarSign, AlertTriangle, CheckCircle2,
  RefreshCw, Sliders, ChevronDown, ChevronUp, Loader2
} from "lucide-react";

interface AdminAlloc {
  _id: string;
  adminId: string;
  adminName: string;
  location: string;
  totalDemand: number;
  allocatedBudget: number;
  usedBudget: number;
  remainingBudget: number;
  priorityScore: number;
  performanceScore: number;
  demandScore: number;
  allocationScore: number;
}

interface Overview {
  budget: { totalBudget: number; allocatedAmount: number; remainingAmount: number };
  allocations: AdminAlloc[];
  summary: {
    totalDemand: number;
    totalAllocated: number;
    surplus: number;
    overDemand: boolean;
    demandExcess: number;
  };
}

const LOCATION_COLORS: Record<string, string> = {
  Bangalore: "#6366f1",
  Pune: "#10b981",
  Delhi: "#f59e0b",
  Chennai: "#ef4444",
};

const fmt = (n: number) =>
  n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : `$${n.toLocaleString()}`;

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

export default function FinanceDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [allocating, setAllocating] = useState(false);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [priorityEdits, setPriorityEdits] = useState<Record<string, number>>({});
  const [showPriorityPanel, setShowPriorityPanel] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const { socket } = useSocket();

  const load = useCallback(async () => {
    try {
      const data = await api.finance.overview() as unknown as Overview;
      setOverview(data);
      const initPriority: Record<string, number> = {};
      data.allocations.forEach((a) => { initPriority[a.adminId] = a.priorityScore; });
      setPriorityEdits(initPriority);
    } catch {
      showToast("Failed to load finance overview", false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    const handler = () => load();
    socket.on("ADMIN_ALLOCATION_UPDATED", handler);
    socket.on("BUDGET_UPDATED", handler);
    return () => { socket.off("ADMIN_ALLOCATION_UPDATED", handler); socket.off("BUDGET_UPDATED", handler); };
  }, [socket, load]);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const handleRunAllocation = async () => {
    setAllocating(true);
    try {
      await api.finance.allocate(priorityEdits);
      await load();
      showToast("Weighted allocation applied successfully", true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Allocation failed", false);
    } finally {
      setAllocating(false);
    }
  };

  const handleOverride = async (adminId: string) => {
    const amt = parseFloat(overrideAmount);
    if (isNaN(amt) || amt < 0) { showToast("Enter a valid amount", false); return; }
    try {
      await api.finance.override(adminId, amt);
      setOverrideId(null);
      setOverrideAmount("");
      await load();
      showToast("Override applied", true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Override failed", false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="animate-spin text-blue-400" size={32} />
        </div>
      </Layout>
    );
  }

  const allocs = overview?.allocations ?? [];
  const budget = overview?.budget;
  const summary = overview?.summary;

  const barData = allocs.map((a) => ({
    location: a.location,
    Demand: a.totalDemand,
    Allocated: a.allocatedBudget,
    Used: a.usedBudget,
  }));

  const pieData = allocs.map((a) => ({
    name: a.location,
    value: a.allocatedBudget,
  }));

  const radarData = allocs.map((a) => ({
    location: a.location,
    Priority: a.priorityScore * 10,
    Demand: Math.round(a.demandScore * 100),
    Performance: Math.round(a.performanceScore * 100),
    Score: Math.round(a.allocationScore * 100),
  }));

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
              <TrendingUp size={24} className="text-purple-400" />
              Finance Manager Dashboard
            </h1>
            <p className="text-gray-400 text-sm mt-1">Weighted dynamic budget distribution across locations</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowPriorityPanel(!showPriorityPanel)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors">
              <Sliders size={14} />Priority Scores
              {showPriorityPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button onClick={handleRunAllocation} disabled={allocating}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {allocating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Run Weighted Allocation
            </button>
          </div>
        </div>

        {/* Priority Score Panel */}
        {showPriorityPanel && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">
              Set Strategic Priority Scores (1–10) — Higher score = more budget share
            </h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {allocs.map((a) => (
                <div key={a.adminId} className="space-y-2">
                  <label className="text-xs text-gray-400">{a.location}</label>
                  <input
                    type="number" min={1} max={10} step={1}
                    value={priorityEdits[a.adminId] ?? a.priorityScore}
                    onChange={(e) => setPriorityEdits({ ...priorityEdits, [a.adminId]: Number(e.target.value) })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                  <p className="text-xs text-gray-600">Perf: {pct(a.performanceScore)}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-3">Click "Run Weighted Allocation" to apply changes.</p>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Budget", value: fmt(budget?.totalBudget ?? 0), icon: <DollarSign size={16} />, color: "text-blue-400", bg: "bg-blue-900/20" },
            { label: "Total Demand", value: fmt(summary?.totalDemand ?? 0), icon: <TrendingUp size={16} />, color: "text-amber-400", bg: "bg-amber-900/20" },
            { label: "Total Allocated", value: fmt(summary?.totalAllocated ?? 0), icon: <CheckCircle2 size={16} />, color: "text-emerald-400", bg: "bg-emerald-900/20" },
            {
              label: summary?.overDemand ? "Demand Excess" : "Budget Surplus",
              value: fmt(summary?.demandExcess ?? summary?.surplus ?? 0),
              icon: <AlertTriangle size={16} />,
              color: summary?.overDemand ? "text-red-400" : "text-emerald-400",
              bg: summary?.overDemand ? "bg-red-900/20" : "bg-emerald-900/20",
            },
          ].map((card) => (
            <div key={card.label} className={`${card.bg} border border-gray-800 rounded-xl p-4`}>
              <div className={`flex items-center gap-2 ${card.color} mb-2`}>
                {card.icon}
                <span className="text-xs font-medium">{card.label}</span>
              </div>
              <p className="text-xl font-bold text-white">{card.value}</p>
            </div>
          ))}
        </div>

        {summary?.overDemand && (
          <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-300">
              Total demand ({fmt(summary.totalDemand)}) exceeds the budget pool ({fmt(budget?.totalBudget ?? 0)}) by{" "}
              <strong>{fmt(summary.demandExcess)}</strong>. Run weighted allocation to distribute available budget dynamically.
            </p>
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Bar chart: demand vs allocation */}
          <div className="md:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Demand vs Allocation vs Used by Location</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="location" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                  formatter={(val: number) => fmt(val)}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
                <Bar dataKey="Demand" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Allocated" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Used" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie chart: budget distribution */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Budget Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false} style={{ fontSize: 10 }}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={LOCATION_COLORS[entry.name] ?? "#6b7280"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1">
              {pieData.map((e) => (
                <div key={e.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: LOCATION_COLORS[e.name] }} />
                    <span className="text-gray-400">{e.name}</span>
                  </div>
                  <span className="text-white font-medium">{fmt(e.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Radar chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Weighted Score Components by Location (% scale)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#374151" />
              <PolarAngleAxis dataKey="location" tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 10 }} />
              {["Priority", "Demand", "Performance", "Score"].map((key, i) => (
                <Radar key={key} name={key} dataKey={key}
                  stroke={["#6366f1", "#f59e0b", "#10b981", "#ef4444"][i]}
                  fill={["#6366f1", "#f59e0b", "#10b981", "#ef4444"][i]}
                  fillOpacity={0.1} />
              ))}
              <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Admin allocation table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white">Location Admin Allocations — Manual Override</h3>
            <p className="text-xs text-gray-500 mt-1">Formula: 50% × Priority + 30% × Demand + 20% × Performance</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase">
                  <th className="text-left p-4">Location</th>
                  <th className="text-right p-4">Priority</th>
                  <th className="text-right p-4">Demand Score</th>
                  <th className="text-right p-4">Perf Score</th>
                  <th className="text-right p-4">Weight Score</th>
                  <th className="text-right p-4">Demand</th>
                  <th className="text-right p-4">Allocated</th>
                  <th className="text-right p-4">Used</th>
                  <th className="text-right p-4">Remaining</th>
                  <th className="text-center p-4">Override</th>
                </tr>
              </thead>
              <tbody>
                {allocs.map((a) => (
                  <tr key={a._id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: LOCATION_COLORS[a.location] ?? "#6b7280" }} />
                        <span className="text-white font-medium">{a.location}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <span className="px-2 py-0.5 rounded bg-gray-800 text-blue-300 font-mono">{a.priorityScore}/10</span>
                    </td>
                    <td className="p-4 text-right text-amber-400">{pct(a.demandScore)}</td>
                    <td className="p-4 text-right text-emerald-400">{pct(a.performanceScore)}</td>
                    <td className="p-4 text-right">
                      <span className="text-purple-300 font-mono">{a.allocationScore.toFixed(3)}</span>
                    </td>
                    <td className="p-4 text-right text-gray-300">{fmt(a.totalDemand)}</td>
                    <td className="p-4 text-right text-blue-300 font-medium">{fmt(a.allocatedBudget)}</td>
                    <td className="p-4 text-right text-emerald-300">{fmt(a.usedBudget)}</td>
                    <td className="p-4 text-right">
                      <span className={a.remainingBudget < 0 ? "text-red-400" : "text-gray-300"}>{fmt(a.remainingBudget)}</span>
                    </td>
                    <td className="p-4 text-center">
                      {overrideId === a.adminId ? (
                        <div className="flex items-center gap-2 justify-center">
                          <input
                            type="number" value={overrideAmount}
                            onChange={(e) => setOverrideAmount(e.target.value)}
                            className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                            placeholder="Amount"
                            autoFocus
                          />
                          <button onClick={() => handleOverride(a.adminId)}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded transition-colors">Set</button>
                          <button onClick={() => { setOverrideId(null); setOverrideAmount(""); }}
                            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors">×</button>
                        </div>
                      ) : (
                        <button onClick={() => { setOverrideId(a.adminId); setOverrideAmount(String(a.allocatedBudget)); }}
                          className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors">
                          Override
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
