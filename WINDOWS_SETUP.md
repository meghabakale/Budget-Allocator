# Windows Local Development Setup

This guide covers running **BudgetFlow** on a Windows machine using **npm**.

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Node.js | 20 LTS (x64) | https://nodejs.org |
| npm | 10+ (included with Node) | Included with Node.js |
| MongoDB | 7.x Community (or Atlas) | https://www.mongodb.com/try/download/community |
| Git | any | https://git-scm.com |

> **Windows Terminal + PowerShell 7** are strongly recommended over the legacy `cmd.exe` prompt.

---

## Quick-start

```powershell
# 1. Install dependencies
npm install

# 2. Start the entire application (API Server + Frontend App)
npm run dev
```

Open **http://localhost:24432** in your browser.

---

## Workspace Scripts

If you want to run specific services individually:

```powershell
# Start API Server only (Port 8080)
npm run dev:server

# Start Budget App Frontend only (Port 24432)
npm run dev:app

# Run TypeScript type checks across all packages
npm run typecheck
```

---

## Environment Variables

All required variables are documented in **`.env.example`**.
Copy `.env.example` to `.env` at the workspace root to override defaults (e.g. `MONGODB_URI`, `JWT_SECRET`, `SESSION_SECRET`).

---

## Troubleshooting

### `Cannot find module '...'` after `npm install`
Run `npm install` again to refresh workspace package links.

### MongoDB connection refused
Make sure your MongoDB instance or Atlas connection string in `.env` is active:
```powershell
Start-Service MongoDB   # if installed locally as a service
```

### Port already in use (`EADDRINUSE`)
If ports 8080 or 24432 are in use by a background process, stop them via PowerShell:
```powershell
Get-NetTCPConnection -LocalPort 8080, 24432 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```
