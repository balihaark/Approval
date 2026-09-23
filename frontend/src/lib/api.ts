import type { Approval, ActivityItem, UnprocessedMail, User } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL || "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const needsJsonBody =
    options.body !== undefined && options.body !== null
      ? true
      : method === "POST" || method === "PUT" || method === "PATCH";

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  let body = options.body;
  if (needsJsonBody) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    if (body === undefined || body === null) {
      body = "{}";
    }
  }

  const res = await fetch(`${API}${path}`, {
    ...options,
    method,
    body,
    credentials: "include",
    headers,
  });

  if (res.status === 401 && typeof window !== "undefined") {
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const err = data as { message?: string; error?: string } | null;
    throw new ApiError(
      res.status,
      err?.message || err?.error || res.statusText
    );
  }
  return data as T;
}

export function ssoCallback(token: string) {
  return api<{ user: User }>("/auth/sso/callback", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function devLogin(email: string) {
  return api<{ user: User }>("/auth/dev-login", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function logout() {
  return api<{ ok: boolean }>("/auth/logout", { method: "POST" });
}

export function me() {
  return api<{ user: User }>("/auth/me");
}

export type ApprovalQuery = {
  view?: "sent" | "received" | "part-of" | "all";
  state?: string;
  department?: string;
  project?: string;
  q?: string;
  participant?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export function listApprovals(query: ApprovalQuery) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== "") params.set(k, String(v));
  });
  return api<{ total: number; page: number; pageSize: number; items: Approval[] }>(
    `/approvals?${params.toString()}`
  );
}

export function getApproval(id: string) {
  return api<Approval>(`/approvals/${id}`);
}

export function createApproval(payload: {
  subject: string;
  body: string;
  approvers: string[];
  participants?: string[];
  department?: string | null;
  project?: string | null;
}) {
  return api<{ approval: Approval; emailSent: boolean }>("/approvals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getActivity(id: string) {
  return api<{ items: ActivityItem[] }>(`/approvals/${id}/activity`);
}

export function decide(
  id: string,
  decision: "approved" | "rejected",
  reason?: string
) {
  return api<{ approval: Approval; emailError: string | null }>(
    `/approvals/${id}/decide`,
    {
      method: "POST",
      body: JSON.stringify({ decision, reason }),
    }
  );
}

export function revokeApproval(id: string, data: { reason: string }) {
  return api<{ approval: Approval; emailError?: string | null }>(
    `/approvals/${id}/revoke`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

export function resubmitApprovalAfterRevoke(id: string) {
  return api<{ approval: Approval; emailError?: string | null }>(
    `/approvals/${id}/resubmit-after-revoke`,
    {
      method: "POST",
    }
  );
}

export function updateApproval(
  id: string,
  patch: { department?: string | null; project?: string | null }
) {
  return api<Approval>(`/approvals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function listUnprocessed(resolved = false) {
  return api<{ items: UnprocessedMail[] }>(
    `/admin/unprocessed${resolved ? "?resolved=true" : ""}`
  );
}

export function resolveUnprocessed(id: string) {
  return api(`/admin/unprocessed/${id}/resolve`, { method: "POST" });
}

export function gmailStatus() {
  return api<{
    configured: boolean;
    user: string;
    hasPubsubTopic: boolean;
    historyId: string | null;
    watchExpiry: string | null;
    lastReconcileAt: string | null;
  }>("/admin/gmail/status");
}

export function gmailReconcile() {
  return api("/admin/gmail/reconcile", { method: "POST" });
}

export function gmailWatch() {
  return api("/admin/gmail/watch", { method: "POST" });
}

export function startGmailOauth() {
  return api<{ url: string }>("/gmail/oauth/start");
}

export function listUsers() {
  return api<{
    items: {
      id: string;
      email: string;
      name: string;
      role: "USER" | "ADMIN";
      isActive: boolean;
      lastLoginAt: string | null;
      createdAt: string;
    }[];
  }>("/admin/users");
}

export function adminStats() {
  return api<{
    approvals: number;
    pending: number;
    unprocessed: number;
    users: number;
  }>("/admin/stats");
}

export function simulateEmail(payload: {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  department?: string;
  project?: string;
}) {
  return api("/admin/simulate-email", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
