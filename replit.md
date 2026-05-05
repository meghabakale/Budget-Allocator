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
  models/         — User, Budget, BudgetRequest, AdminAllocation, AuditLog, NegotiationMessage
  routes/         — auth, budget, requests, conflicts, finance, adminLocation, negotiation, audit, export
  services/       — cascadeRecalculation.ts, weightedAllocationService.ts, seedService.ts, auditService.ts
  middleware/     — auth.ts (JWT), roleAuth.ts (requireRole, requireFinanceManager, requireLocationAdmin)
  sockets/        — Socket.io setup and event helpers

artifacts/budget-app/src/
  pages/          — Login, Dashboard, AllocationBoard, Requests, NegotiationPanel,
                    AdminPanel, AuditLogs, FinanceDashboard, LocationAdminDashboard
  components/     — Layout.tsx (role-aware nav)
  context/        — AuthContext.tsx (isFinanceManager, isLocationAdmin), SocketContext.tsx
  services/       — api.ts (finance.*, locationAdmin.*)
```

## Architecture Decisions

- **Weighted allocation formula**: `score = 0.5×priority + 0.3×demand + 0.2×performance` — guarantees non-equal distribution
- **Cascading recalculation engine** (cascadeRecalculation.ts): atomic MongoDB transactions, in-process race-condition lock, 8 trigger types, central Socket.io emission
- **esbuild gotcha**: Mongoose pre-save hooks must NOT use `next` parameter (causes runtime errors when bundled)
- **Backward-compat**: `admin` role still treated as `finance_manager` throughout middleware; no breaking change
- **Location-scoped isolation**: `location_admin` can only see their own location's requests and departments; Finance Manager sees all

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

**Features:**
- Finance Manager Dashboard: weighted allocation, demand vs allocation charts (bar, pie, radar), per-location override, priority score editor
- Location Admin Dashboard: local department view, submit demand to Finance Manager, approve/reject local requests, allocation score breakdown
- Shared budget pool ($1M), real-time Socket.io updates, conflict arbitration, cascading recalculation, negotiation chat, audit trail, CSV/JSON export

## API Routes

| Group | Method | Path | Description |
|-------|--------|------|-------------|
| Finance | GET | /api/finance/overview | Full system view |
| Finance | POST | /api/finance/allocate-budget | Run weighted allocation |
| Finance | PUT | /api/finance/override-allocation | Manual override |
| Finance | PUT | /api/finance/set-priority | Set location priority/performance scores |
| Finance | GET | /api/finance/admins | List all admin allocations |
| Location Admin | GET | /api/location-admin/departments | Dept heads in location |
| Location Admin | GET | /api/location-admin/requests | Requests scoped to location |
| Location Admin | GET | /api/location-admin/summary | My allocation record |
| Location Admin | POST | /api/location-admin/demand | Submit demand |
| Location Admin | POST | /api/location-admin/resolve/:id | Approve/reject request |

## Gotchas

- Drop all MongoDB collections and restart API server whenever seed structure changes (new roles/fields)
- `SESSION_SECRET` is declared but not actively used; JWT_SECRET is the active auth secret
- The `location` field on BudgetRequest must match the admin's location for `location_admin` filtering to work — requests are matched by `(LocationName)` substring in departmentName
