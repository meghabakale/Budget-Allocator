import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    department: string;
    location: string;
    adminId?: string;
  };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }
  const token = header.slice(7);
  const secret = process.env["JWT_SECRET"] || "fallback-secret";
  try {
    const payload = jwt.verify(token, secret) as {
      id: string;
      username: string;
      role: string;
      department: string;
      location: string;
      adminId?: string;
    };
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Check if the user is a finance manager or legacy admin */
export function isFinanceManager(user: AuthRequest["user"]): boolean {
  return user?.role === "finance_manager" || user?.role === "admin";
}

/** Check if the user has elevated access (finance_manager, admin, or location_admin) */
export function isElevated(user: AuthRequest["user"]): boolean {
  return isFinanceManager(user) || user?.role === "location_admin";
}
