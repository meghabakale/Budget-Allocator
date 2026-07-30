import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import {
  LayoutDashboard, FileText, MessageSquare, ShieldCheck,
  ClipboardList, LogOut, IndianRupee, Wifi, WifiOff,
  TrendingUp, MapPin, Menu, X
} from "lucide-react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isFinanceManager, isLocationAdmin, isAdmin } = useAuth();
  const { connected } = useSocket();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} />, show: true },
    { to: "/allocation", label: "Allocation Board", icon: <IndianRupee size={18} />, show: true },
    { to: "/requests", label: "My Requests", icon: <FileText size={18} />, show: true },
    { to: "/negotiation", label: "Negotiation", icon: <MessageSquare size={18} />, show: true },
    { to: "/finance", label: "Finance Manager", icon: <TrendingUp size={18} />, show: isFinanceManager },
    { to: "/location-admin", label: "Location Admin", icon: <MapPin size={18} />, show: isLocationAdmin },
    { to: "/admin", label: "Admin Panel", icon: <ShieldCheck size={18} />, show: isAdmin },
    { to: "/audit", label: "Audit Logs", icon: <ClipboardList size={18} />, show: isAdmin },
  ].filter((item) => item.show);

  const roleColor: Record<string, string> = {
    finance_manager: "bg-purple-600",
    admin: "bg-purple-600",
    location_admin: "bg-blue-600",
    department_head: "bg-emerald-600",
  };

  const roleBadge: Record<string, string> = {
    finance_manager: "Finance Manager",
    admin: "Finance Manager",
    location_admin: `Admin · ${user?.location ?? ""}`,
    department_head: `${user?.department ?? ""} · ${user?.location ?? ""}`,
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Mobile Top Navigation Header */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <IndianRupee size={16} />
          </div>
          <div>
            <p className="font-bold text-sm text-white">BudgetFlow</p>
            <p className="text-[10px] text-gray-400 truncate max-w-[150px]">
              {user?.username ? `${user.username} (${user.role?.replace("_", " ")})` : "Multi-Admin System"}
            </p>
          </div>
        </div>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-gray-400 hover:text-white rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Backdrop for Mobile Navigation */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0 transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-6 border-b border-gray-800 hidden lg:block">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <IndianRupee size={16} />
            </div>
            <div>
              <p className="font-bold text-sm text-white">BudgetFlow</p>
              <p className="text-xs text-gray-500">Multi-Admin System</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-b border-gray-800 lg:hidden">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Navigation</span>
          <button onClick={() => setMobileMenuOpen(false)} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = location === item.to || location.startsWith(item.to + "/");
            return (
              <Link key={item.to} href={item.to}>
                <a
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-lg text-sm transition-all ${
                    active ? "bg-blue-600 text-white font-medium" : "text-gray-400 hover:bg-gray-800 hover:text-white"
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
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Status</span>
            <div className="flex items-center gap-1.5">
              {connected ? (
                <><Wifi size={12} className="text-green-400" /><span className="text-green-400">Live</span></>
              ) : (
                <><WifiOff size={12} className="text-red-400" /><span className="text-red-400">Offline</span></>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <div className={`w-8 h-8 ${roleColor[user?.role ?? ""] ?? "bg-gray-700"} rounded-full flex items-center justify-center text-xs font-bold shrink-0`}>
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.username}</p>
              <p className="text-[11px] text-gray-400 truncate">{roleBadge[user?.role ?? ""] ?? user?.role}</p>
            </div>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                logout();
              }}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-gray-950 min-w-0">
        {children}
      </main>
    </div>
  );
}

