# BudgetFlow — Real-Time Collaborative Budget Allocation System with Multi-Admin Architecture

## Run & Operate

```bash
pnpm --filter @workspace/api-server run dev   # API server (port 8080, path /api)
pnpm --filter @workspace/budget-app run dev   # Frontend (port 24432, path /)
```

Required secrets: `MONGODB_URI`, `JWT_SECRET`, `SESSION_SECRET`

## Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: React 19, Vite, Tailwind CSS, Wouter (routing), Socket.io-client, Recharts
- **Backend**: Node.js, Express 5, MongoDB + Mongoose, Socket.io, JWT, bcryptjs
- **Build**: esbuild (ESM bundle for server)

## Where Things Live

```
artifacts/api-server/src/
  models/         — User, Budget, BudgetRequest (incl. pending_reapproval status), AdminAllocation, AuditLog
  routes/         — auth, budget, requests, conflicts, finance, adminLocation, negotiation, audit, export
  services/       — cascadeRecalculation.ts, weightedAllocationService.ts, seedService.ts, auditService.ts, exportService.ts
  middleware/     — auth.ts (JWT), roleAuth.ts (requireRole, requireFinanceManager, requireLocationAdmin)
  sockets/        — Socket.io setup; emits REQUEST_REQUIRES_REAPPROVAL

artifacts/budget-app/src/
  pages/          — Login, Dashboard, AllocationBoard, Requests, NegotiationPanel,
                    AdminPanel, AuditLogs, FinanceDashboard, LocationAdminDashboard
  components/     — Layout.tsx (role-aware nav), StatusBadge.tsx (incl. pending_reapproval)
  context/        — AuthContext.tsx (isFinanceManager, isLocationAdmin), SocketContext.tsx
  lib/            — currency.ts (formatCurrency, fmtShort, fmtAxis — Indian Rupee en-IN)
  services/       — api.ts (finance.*, locationAdmin.*)
```

## Architecture Decisions

- **Weighted allocation formula**: `score = 0.5×priority + 0.3×demand + 0.2×performance` — guarantees non-equal distribution
- **PENDING_REAPPROVAL status**: cascading recalculation never auto-approves previously-conflicted requests; budget eligibility is flagged but admin must explicitly approve/reject. Emits `REQUEST_REQUIRES_REAPPROVAL` Socket.io event.
- **Cascading recalculation engine** (cascadeRecalculation.ts): atomic MongoDB transactions, in-process race-condition lock, central Socket.io emission. `pending_reapproval` requests do NOT consume budget — only committed `approved` allocations count.
- **Indian Rupee standardization**: All monetary display uses `Intl.NumberFormat("en-IN", { currency: "INR" })` via `src/lib/currency.ts`. Backend stores raw numbers only; formatting is display/export layer only. Exports include `_formatted` field with ₹ value and BOM for Excel compatibility.
- **esbuild gotcha**: Mongoose pre-save hooks must NOT use `next` parameter (causes runtime errors when bundled)
- **Backward-compat**: `admin` role still treated as `finance_manager` throughout middleware; no breaking change

## Product

**Roles:**
| Role | Username | Password |
|------|----------|----------|
| Finance Manager | finance_mgr | admin123 |
| Bangalore Admin | blr_admin | admin123 |
| Pune Admin | pune_admin | admin123 |
| Delhi Admin | delhi_admin | admin123 |
| Chennai Admin | chennai_admin | admin123 |
| BLR Engineering | blr_eng | password123 |
| Pune Engineering | pune_eng | password123 |
| Delhi Marketing | delhi_mkt | password123 |
| Chennai HR | chennai_hr | password123 |

**Request Status Flow:**
`pending → conflicted → pending_reapproval → approved / rejected`

**Features:**
- Finance Manager Dashboard: weighted allocation, demand vs allocation charts (bar, pie, radar in ₹), per-location override, priority score editor
- Location Admin Dashboard: local dept view, submit demand, approve/reject local requests + pending re-approvals, allocation score breakdown
- Allocation Board: Pending Re-Approval column appears dynamically when budget opens up; approve/reject inline
- Shared budget pool (₹1Cr), real-time Socket.io updates, conflict arbitration, cascading recalculation, negotiation chat, audit trail, CSV/JSON export (with ₹ formatted fields)

## Gotchas

- Drop all MongoDB collections and restart API server whenever seed structure changes
- `SESSION_SECRET` is declared but not actively used; `JWT_SECRET` is the active auth secret
- Location filtering uses substring match: `departmentName.includes("(LocationName)")`
- `pending_reapproval` does NOT reduce remaining budget in cascade — only `approved` commits funds
- No `$` symbols anywhere in UI — all currency is ₹ Indian Rupee format
