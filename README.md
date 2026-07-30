# 💼 BudgetFlow — Collaborative Budget & Asset Management

BudgetFlow is a real-time, enterprise-grade collaborative budget allocation and asset management application built with **React**, **Node.js / Express**, **MongoDB**, and **Socket.IO**.

---

## ✨ Key Features

- **📊 Real-Time Financial Dashboards**: Interactive metrics, charts, and live budget allocation summaries.
- **⚡ Multi-User Collaboration**: Live WebSockets powered by Socket.IO for instant real-time synchronization across sessions.
- **🛡️ Role-Based Access Control (RBAC)**: Tailored dashboards and granular permission controls for:
  - **Super Admin**: System-wide configuration, user role management, and global oversight.
  - **Finance Manager**: High-level budget distribution, global approval workflows, and metrics tracking.
  - **Location Admin**: Regional asset management, location-based budget tracking, and request handling.
  - **Requester**: Simple budget request submissions and personal request tracking.
- **📝 Request & Approval Workflows**: Formal budget requests, status tracking, automated recalculation, and data exports.
- **🤝 Negotiation & Conflict Resolution**: Dedicated negotiation panel for budget allocation disputes and counter-offers.
- **📜 Comprehensive Audit Logs**: Immutable activity trails for transparent financial compliance.

---

## 🛠️ Technology Stack

### Frontend (`@workspace/budget-app`)
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7
- **Styling**: TailwindCSS v4 + Radix UI Primitives + Framer Motion
- **State & Data**: TanStack Query v5 + Socket.IO Client + Wouter Router
- **Visualization**: Recharts + Lucide Icons + Sonner Toasts

### Backend (`@workspace/api-server`)
- **Runtime**: Node.js 20+ LTS
- **Framework**: Express 5 + TypeScript
- **Database**: MongoDB + Mongoose 9
- **Real-Time Engine**: Socket.IO 4
- **Security & Auth**: JWT + Cookie-Parser + Bcryptjs
- **Validation & Logging**: Zod + Pino Logger

### Shared Monorepo Packages (`lib/`)
- `@workspace/api-zod`: Shared Zod validation schemas
- `@workspace/db`: Centralized database schemas and models
- `@workspace/api-client-react`: React hooks and client bindings

---

## 📁 Repository Structure

```
├── artifacts/
│   ├── api-server/         # Express REST API & Socket.IO WebSockets server
│   └── budget-app/         # Vite + React single-page frontend application
├── lib/
│   ├── api-client-react/   # TanStack Query React hooks & client bindings
│   ├── api-spec/           # OpenAPI specs & Orval codegen configuration
│   ├── api-zod/            # Zod validation schemas
│   └── db/                 # Shared database models & schemas
├── scripts/                # Utility and preinstall scripts
├── package.json            # Monorepo workspace configuration
├── vercel.json             # Vercel deployment configuration
├── render.yaml             # Render deployment configuration
└── README.md               # Project documentation
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js** v20+ LTS
- **npm** v10+
- **MongoDB** v7+ (Local service or MongoDB Atlas connection)

### 2. Installation
Clone the repository and install all monorepo workspace dependencies:
```bash
git clone https://github.com/meghabakale/Budget-Allocator.git
cd Budget-Allocator
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env` in the project root:
```bash
cp .env.example .env
```

Ensure `.env` contains your database and server configuration:
```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/budgetflow
JWT_SECRET=your_jwt_secret_key
SESSION_SECRET=your_session_secret_key
PORT=8080
```

### 4. Run the Development Server
Start both the **API Server** and **Frontend Application** concurrently:
```bash
npm run dev
```

- **Frontend App**: [http://localhost:24432](http://localhost:24432)
- **API Server**: [http://localhost:8080](http://localhost:8080) (Health check: `http://localhost:8080/api/healthz`)

---

## 📜 Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts Express API (port 8080) and React Frontend (port 24432) concurrently |
| `npm run dev:server` | Starts the Express API server only |
| `npm run dev:app` | Starts the Vite React frontend only |
| `npm run build` | Builds all monorepo packages for production |
| `npm run typecheck` | Runs TypeScript compilation checks across all workspaces |

---

## 📄 License

This project is licensed under the MIT License.
