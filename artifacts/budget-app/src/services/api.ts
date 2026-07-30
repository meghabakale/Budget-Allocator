const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const BASE = API_URL ? `${API_URL}/api` : "/api";

function getToken() {
  return localStorage.getItem("budget_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ token: string; user: Record<string, unknown> }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    register: (data: Record<string, unknown>) =>
      request<{ token: string; user: Record<string, unknown> }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  budget: {
    get: () => request<Record<string, unknown>>("/budget"),
    update: (totalBudget: number) =>
      request<Record<string, unknown>>("/budget/update", {
        method: "PUT",
        body: JSON.stringify({ totalBudget }),
      }),
  },
  requests: {
    list: () => request<Record<string, unknown>[]>("/requests"),
    create: (data: Record<string, unknown>) =>
      request<Record<string, unknown>>("/requests", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Record<string, unknown>>(`/requests/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<Record<string, unknown>>(`/requests/${id}`, { method: "DELETE" }),
    updateStatus: (id: string, status: string, adminNote?: string, reason?: string) =>
      request<Record<string, unknown>>(`/requests/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, adminNote, reason }),
      }),
  },
  conflicts: {
    resolve: (data: Record<string, unknown>) =>
      request<Record<string, unknown>>("/conflicts/resolve", { method: "POST", body: JSON.stringify(data) }),
    rollback: (id: string) =>
      request<Record<string, unknown>>(`/conflicts/rollback/${id}`, { method: "POST" }),
  },
  negotiation: {
    getMessages: (requestId: string) =>
      request<Record<string, unknown>[]>(`/messages/${requestId}`),
    sendMessage: (data: Record<string, unknown>) =>
      request<Record<string, unknown>>("/messages", { method: "POST", body: JSON.stringify(data) }),
  },
  audit: {
    list: () => request<Record<string, unknown>[]>("/audit"),
  },
  export: {
    download: async (type: string, format: string): Promise<Blob> => {
      const token = getToken();
      const res = await fetch(`${BASE}/export/${type}?format=${format}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error || "Export failed");
      }
      return res.blob();
    },
  },
  finance: {
    overview: () => request<Record<string, unknown>>("/finance/overview"),
    allocate: (priorityOverrides?: Record<string, number>) =>
      request<Record<string, unknown>>("/finance/allocate-budget", {
        method: "POST",
        body: JSON.stringify({ priorityOverrides }),
      }),
    override: (adminId: string, allocatedBudget: number, adminNote?: string) =>
      request<Record<string, unknown>>("/finance/override-allocation", {
        method: "PUT",
        body: JSON.stringify({ adminId, allocatedBudget, adminNote }),
      }),
    setPriority: (adminId: string, priorityScore: number, performanceScore?: number) =>
      request<Record<string, unknown>>("/finance/set-priority", {
        method: "PUT",
        body: JSON.stringify({ adminId, priorityScore, performanceScore }),
      }),
    admins: () => request<Record<string, unknown>[]>("/finance/admins"),
  },
  locationAdmin: {
    departments: () => request<Record<string, unknown>[]>("/location-admin/departments"),
    requests: () => request<Record<string, unknown>[]>("/location-admin/requests"),
    summary: () => request<Record<string, unknown> | Record<string, unknown>[]>("/location-admin/summary"),
    submitDemand: (demandAmount: number, note?: string) =>
      request<Record<string, unknown>>("/location-admin/demand", {
        method: "POST",
        body: JSON.stringify({ demandAmount, note }),
      }),
    resolve: (id: string, action: string, adminNote?: string, reason?: string) =>
      request<Record<string, unknown>>(`/location-admin/resolve/${id}`, {
        method: "POST",
        body: JSON.stringify({ action, adminNote, reason }),
      }),
  },
};
