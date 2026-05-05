import { Link, useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import {
  LayoutDashboard, FileText, AlertTriangle, MessageSquare,
  ShieldCheck, ClipboardList, LogOut, DollarSign, Wifi, WifiOff
} from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { to: "/allocation", label: "Allocation Board", icon: <DollarSign size={18} /> },
  { to: "/requests", label: "My Requests", icon: <FileText size={18} /> },
  { to: "/negotiation", label: "Negotiation", icon: <MessageSquare size={18} /> },
  { to: "/admin", label: "Admin Panel", icon: <ShieldCheck size={18} />, adminOnly: true },
  { to: "/audit", label: "Audit Logs", icon: <ClipboardList size={18} />, adminOnly: true },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const { connected } = useSocket();
  const [location] = useLocation();

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <DollarSign size={16} />
            </div>
            <div>
              <p className="font-bold text-sm text-white">BudgetFlow</p>
              <p className="text-xs text-gray-500">Real-Time System</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => {
              const active = location === item.to || location.startsWith(item.to + "/");
              return (
                <Link key={item.to} href={item.to}>
                  <a
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                      active
                        ? "bg-blue-600 text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </a>
                </Link>
              );
            })}
        </nav>

        <div className="p-4 border-t border-gray-800 space-y-3">
          <div className="flex items-center gap-2 text-xs">
            {connected ? (
              <><Wifi size={12} className="text-green-400" /><span className="text-green-400">Live</span></>
            ) : (
              <><WifiOff size={12} className="text-red-400" /><span className="text-red-400">Offline</span></>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-xs font-bold">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.username}</p>
              <p className="text-xs text-gray-500 truncate capitalize">{user?.role?.replace("_", " ")}</p>
            </div>
            <button onClick={logout} className="text-gray-500 hover:text-red-400 transition-colors">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gray-950">
        {children}
      </main>
    </div>
  );
}
