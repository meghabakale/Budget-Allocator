const BASE = "/api";

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
    download: (type: string, format: string) => {
      const token = getToken();
      window.open(`${BASE}/export/${type}?format=${format}&token=${token}`, "_blank");
    },
  },
};
