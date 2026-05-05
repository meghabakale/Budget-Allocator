# BudgetFlow — Real-Time Collaborative Budget Allocation System

## Overview

Full-stack real-time budget management system with conflict arbitration, negotiation, audit trails, and exports. Built as a pnpm monorepo.

## Architecture

```
artifacts/
  api-server/     — Express + MongoDB + Socket.io backend (path: /api)
  budget-app/     — React + Vite + Tailwind frontend (path: /)
```

## Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: React 19, Vite, Tailwind CSS, Wouter (routing), Socket.io-client
- **Backend**: Node.js, Express 5, MongoDB + Mongoose, Socket.io, JWT, bcryptjs
- **Build**: esbuild (ESM bundle for server)

## Required Secrets

| Key | Description |
|-----|-------------|
| `MONGODB_URI` | MongoDB connection string (Atlas or local) |
| `JWT_SECRET` | Random string for signing JWT tokens |

## Demo Credentials (auto-seeded)

| User | Password | Role |
|------|----------|------|
| admin | admin123 | Admin |
| eng_head | password123 | Department Head (Engineering) |
| mkt_head | password123 | Department Head (Marketing) |
| ops_head | password123 | Department Head (Operations) |
| hr_head | password123 | Department Head (HR) |

## Features

- **Shared Budget Pool** — $1M total, real-time allocation tracking
- **Budget Requests** — Create, edit, delete with priority levels (High/Medium/Low)
- **Optimistic Concurrency Control** — Version-based conflict detection
- **Conflict Arbitration** — Priority-based rules, admin override (approve/reject/adjust)
- **Cascading Recalculation** — Auto-recalculates on every state change
- **Real-Time (Socket.io)** — Live updates across all connected clients
- **Negotiation Chat** — Per-request chat panel for discussion
- **Audit Trail** — Full action history with previous/new state
- **Export** — JSON and CSV for budget, requests, and audit logs
- **Role-Based Access** — Admin vs Department Head permissions

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/register | Register |
| GET | /api/budget | Get budget pool |
| PUT | /api/budget/update | Update total budget (admin) |
| GET | /api/requests | List requests |
| POST | /api/requests | Create request |
| PUT | /api/requests/:id | Update request |
| DELETE | /api/requests/:id | Delete request |
| POST | /api/conflicts/resolve | Resolve conflict (admin) |
| POST | /api/conflicts/rollback/:id | Rollback request (admin) |
| GET | /api/messages/:requestId | Get negotiation messages |
| POST | /api/messages | Send negotiation message |
| GET | /api/audit | Audit logs (admin) |
| GET | /api/export/budget?format=csv\|json | Export budget |
| GET | /api/export/requests?format=csv\|json | Export requests |
| GET | /api/export/audit?format=csv\|json | Export audit logs |

## Socket.io Events

**Server → Client**: `REQUEST_CREATED`, `REQUEST_UPDATED`, `REQUEST_CONFLICTED`, `REQUEST_STATUS_CHANGED`, `BUDGET_UPDATED`, `NEGOTIATION_MESSAGE`

**Client → Server**: `JOIN_REQUEST`, `LEAVE_REQUEST`, `NEGOTIATE`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/budget-app run dev` — run frontend
