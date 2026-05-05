import { useState } from "react";
import { useLocation } from "wouter";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { DollarSign, Loader2 } from "lucide-react";

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const [form, setForm] = useState({
    username: "",
    password: "",
    email: "",
    department: "",
    role: "department_head",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister) {
        const res = await api.auth.register(form as Record<string, unknown>);
        login(res.token, res.user as never);
      } else {
        const res = await api.auth.login(form.username, form.password);
        login(res.token, res.user as never);
      }
      setLocation("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <DollarSign size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white">BudgetFlow</h1>
          <p className="text-gray-400 mt-1">Real-Time Collaborative Budget System</p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
          <div className="flex rounded-lg bg-gray-800 p-1 mb-6">
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${!isRegister ? "bg-blue-600 text-white" : "text-gray-400"}`}
              onClick={() => { setIsRegister(false); setError(""); }}
            >Login</button>
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${isRegister ? "bg-blue-600 text-white" : "text-gray-400"}`}
              onClick={() => { setIsRegister(true); setError(""); }}
            >Register</button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="Enter username"
                required
              />
            </div>

            {isRegister && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="Enter email"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Department</label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="e.g. Engineering"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="department_head">Department Head</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="Enter password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {isRegister ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-xs text-gray-500 text-center mb-3">Demo credentials</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Admin", u: "admin", p: "admin123" },
                { label: "Engineering", u: "eng_head", p: "password123" },
                { label: "Marketing", u: "mkt_head", p: "password123" },
                { label: "Operations", u: "ops_head", p: "password123" },
              ].map((d) => (
                <button
                  key={d.u}
                  onClick={() => setForm({ ...form, username: d.u, password: d.p })}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1.5 rounded-lg transition-colors text-left"
                >
                  <span className="text-blue-400">{d.label}</span><br />
                  {d.u} / {d.p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
