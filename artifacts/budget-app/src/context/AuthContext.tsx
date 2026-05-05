import { createContext, useContext, useState, type ReactNode } from "react";

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  department: string;
  location: string;
  email?: string;
  adminId?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAdmin: boolean;
  isFinanceManager: boolean;
  isLocationAdmin: boolean;
  isDepartmentHead: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isAdmin: false,
  isFinanceManager: false,
  isLocationAdmin: false,
  isDepartmentHead: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem("budget_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("budget_token"));

  const login = (t: string, u: AuthUser) => {
    setToken(t);
    setUser(u);
    localStorage.setItem("budget_token", t);
    localStorage.setItem("budget_user", JSON.stringify(u));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("budget_token");
    localStorage.removeItem("budget_user");
  };

  const role = user?.role ?? "";
  const isFinanceManager = role === "finance_manager" || role === "admin";
  const isLocationAdmin = role === "location_admin";
  const isAdmin = isFinanceManager || isLocationAdmin;
  const isDepartmentHead = role === "department_head";

  return (
    <AuthContext.Provider value={{
      user, token, login, logout,
      isAdmin, isFinanceManager, isLocationAdmin, isDepartmentHead,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
