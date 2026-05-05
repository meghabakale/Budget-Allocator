type Status = "pending" | "approved" | "rejected" | "conflicted" | "under_negotiation";

const config: Record<Status, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-blue-900/50 text-blue-300 border border-blue-700" },
  approved: { label: "Approved", className: "bg-green-900/50 text-green-300 border border-green-700" },
  rejected: { label: "Rejected", className: "bg-red-900/50 text-red-300 border border-red-700" },
  conflicted: { label: "Conflicted", className: "bg-yellow-900/50 text-yellow-300 border border-yellow-700" },
  under_negotiation: { label: "Negotiating", className: "bg-purple-900/50 text-purple-300 border border-purple-700" },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = config[status as Status] ?? { label: status, className: "bg-gray-800 text-gray-300 border border-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const cls =
    priority === "High" ? "bg-red-900/50 text-red-300 border border-red-700"
    : priority === "Medium" ? "bg-orange-900/50 text-orange-300 border border-orange-700"
    : "bg-gray-800 text-gray-400 border border-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {priority}
    </span>
  );
}
