import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.js";

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

/** Allow finance_manager OR legacy admin role */
export function requireFinanceManager(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || !["finance_manager", "admin"].includes(req.user.role)) {
    res.status(403).json({ error: "Finance Manager access required" });
    return;
  }
  next();
}

/** Allow location_admin, finance_manager, or legacy admin */
export function requireLocationAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || !["location_admin", "finance_manager", "admin"].includes(req.user.role)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
