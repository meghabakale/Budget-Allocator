# Windows Local Development Setup

This guide covers running **BudgetFlow** on a Windows machine.
The project is hosted on Replit (Linux) but every configuration file is
now cross-platform so it can also be cloned and developed locally on Windows.

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Node.js | 20 LTS (x64) | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` |
| MongoDB | 7.x Community (or Atlas) | https://www.mongodb.com/try/download/community |
| Git | any | https://git-scm.com |

> **Windows Terminal + PowerShell 7** are strongly recommended over the legacy
> `cmd.exe` prompt — all examples below assume PowerShell.

---

## Quick-start

```powershell
# 1. Clone
git clone <repo-url>
cd <project-folder>

# 2. Copy and fill in environment variables
Copy-Item .env.example .env
# Edit .env — at minimum set MONGODB_URI, JWT_SECRET, SESSION_SECRET

# 3. Install dependencies
pnpm install

# 4. Build & start the API server  (new terminal)
$env:PORT=8080; $env:NODE_ENV="development"
pnpm --filter @workspace/api-server run dev

# 5. Start the frontend  (another terminal)
$env:PORT=24432; $env:BASE_PATH="/"
pnpm --filter @workspace/budget-app run dev
```

Open http://localhost:24432 in your browser.

---

## Environment variables

All required variables are documented in **`.env.example`**.
Copy that file to `.env` at the workspace root.  The API server and Vite
both read variables from the process environment; on Windows you can either:

- Set them in your PowerShell session (`$env:KEY="value"`)
- Use a `.env` loader such as [`dotenv-cli`](https://www.npmjs.com/package/dotenv-cli):
  ```powershell
  pnpm add -g dotenv-cli
  dotenv -- pnpm --filter @workspace/api-server run dev
  ```

---

## Post-merge setup

After pulling changes that include dependency or schema updates, run:

```powershell
# PowerShell
.\scripts\post-merge.ps1
```

The equivalent bash script (`scripts/post-merge.sh`) still works on
Git-Bash / WSL if you prefer.

---

## Key differences from Linux/Replit

| Area | Linux / Replit | Windows |
|------|---------------|---------|
| `dev` script env-var syntax | `export VAR=x &&` | handled by `cross-env` (transparent) |
| `preinstall` lockfile check | `sh -c '...'` | `node scripts/preinstall.mjs` |
| Post-merge script | `scripts/post-merge.sh` | `scripts\post-merge.ps1` |
| Native binaries (esbuild, rollup, lightningcss) | linux-x64 | win32-x64 — installed automatically by pnpm |
| Workflows / PORT / BASE_PATH | injected by Replit | set manually in shell or via `.env` |

---

## Troubleshooting

### `Cannot find module '...'` after `pnpm install`
Run `pnpm install` again — the first run sometimes needs a second pass for
workspace symlinks on Windows.

### `ENOENT` errors with path separators
All path logic in the codebase uses Node's `path` module, which normalises
separators on Windows automatically. If you encounter a hard-coded slash
issue, open a bug report.

### MongoDB connection refused
Make sure the `mongod` service is running:
```powershell
Start-Service MongoDB   # if installed as a service
# or
mongod --dbpath C:\data\db
```

### Port already in use
Change the `PORT` value in your shell or `.env` file and update the
frontend's API base URL if needed.
