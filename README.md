# 💼 BudgetFlow — Collaborative Budget & Asset Management

BudgetFlow is a real-time, enterprise-grade collaborative budget allocation and asset management application built with **React**, **Node.js/Express**, **MongoDB**, and **Socket.IO**.

---

## ✨ Features

- **📊 Real-Time Financial Dashboards**: Interactive charts and live allocation metrics.
- **⚡ Live Collaboration**: WebSockets powered by Socket.IO for instant multi-user budget updates.
- **🛡️ Role-Based Access Control (RBAC)**: Fine-grained permissions for Admins, Finance Managers, Location Admins, and Requesters.
- **📝 Request & Approval Workflows**: Formal budget requests, status tracking, and automated recalculation engines.
- **🤝 Conflict Resolution & Negotiation**: Panel interface for negotiating budget adjustments and auditing changes.
- **📜 Comprehensive Audit Logging**: Immutable audit trails for transparent compliance tracking.

---

## 🛠️ Technology Stack

### Frontend (`@workspace/budget-app`)
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7
- **Styling**: TailwindCSS v4 + Radix UI Primitives + Framer Motion
- **State & Data**: TanStack Query v5 + Socket.IO Client
- **Charts & Data Viz**: Recharts + Lucide Icons

### Backend (`@workspace/api-server`)
- **Runtime**: Node.js 20+ LTS
- **Framework**: Express 5 + TypeScript
- **Database**: MongoDB + Mongoose 9
- **Real-Time Engine**: Socket.IO 4
- **Security & Auth**: JWT + Cookie-Parser + Bcryptjs
- **Validation**: Zod + Pino Logger

---

## 📁 Repository Structure

```
├── artifacts/
│   ├── api-server/         # Express REST API & Socket.IO server
│   └── budget-app/         # Vite + React single-page frontend application
├── lib/
│   ├── api-client-react/   # TanStack Query React hooks & client bindings
│   ├── api-spec/           # OpenAPI specs & Orval codegen configuration
│   ├── api-zod/            # Zod validation schemas
│   └── db/                 # Shared database models & schemas
├── scripts/                # Build and maintenance scripts
├── package.json            # Monorepo configuration (npm workspaces)
├── WINDOWS_SETUP.md        # Windows local environment guide
└── README.md               # Project documentation
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** v20+ LTS
- **npm** v10+ (included with Node.js)
- **MongoDB** v7+ (Local service or MongoDB Atlas cluster)

### 2. Installation
Clone the repository and install all workspace dependencies:
```bash
git clone <repo-url>
cd Asset-Manager-1zip
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env` in the project root:
```bash
Copy-Item .env.example .env
```
Ensure your `.env` contains:
```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your_jwt_secret_key
SESSION_SECRET=your_session_secret_key
PORT=8080
```

### 4. Running the Application
To run both the **API Server** and **Frontend Application** concurrently:
```bash
npm run dev
```

- **Frontend App**: [http://localhost:24432](http://localhost:24432)
- **API Server**: [http://localhost:8080](http://localhost:8080) (Health check: `http://localhost:8080/api/healthz`)

---

## 📜 Available NPM Scripts

| Script | Description |
| :--- | :--- |
| `npm run dev` | Starts API Server (port 8080) and Frontend App (port 24432) concurrently |
| `npm run dev:server` | Starts the Express API server only |
| `npm run dev:app` | Starts the Vite React frontend app only |
| `npm run build` | Typechecks and builds all workspace packages for production |
| `npm run typecheck` | Validates TypeScript compilation across all workspace packages |

---

## 📄 Documentation

For detailed Windows environment instructions and troubleshooting, refer to [WINDOWS_SETUP.md](WINDOWS_SETUP.md).

---

## 📄 License

This project is licensed under the MIT License.
