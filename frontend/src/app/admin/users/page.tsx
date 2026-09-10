"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AdminOnly } from "@/components/AdminOnly";
import { listUsers } from "@/lib/api";
import {
  Badge,
  EmptyState,
  ErrorState,
  SkeletonRows,
} from "@/components/ui";
import { Users } from "lucide-react";

type AppUser = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export default function AdminUsersPage() {
  const [items, setItems] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUsers();
      setItems(res.items);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load people");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell
      title="People"
      subtitle="Employees who have signed in via SSO. Identity + deactivation are managed in the central HR directory; ADMIN is assigned by a developer on the approvals database."
    >
      <AdminOnly>
        <div className="ui-page">
          <div className="ui-panel overflow-hidden">
            <div className="ui-panel-header">
              <h2 className="ui-panel-title">
                Directory
                {!loading && !loadError && (
                  <span className="ml-2 font-normal text-slate-500">
                    {items.length}
                  </span>
                )}
              </h2>
            </div>

            {loading && <SkeletonRows rows={4} />}

            {!loading && loadError && (
              <ErrorState
                title="Couldn’t load people"
                message={loadError}
                onRetry={() => void load()}
              />
            )}

            {!loading && !loadError && items.length === 0 && (
              <EmptyState
                icon={Users}
                title="No one has signed in yet"
                description="Employees appear here after their first SSO sign-in."
                compact
              />
            )}

            {!loading && !loadError && items.length > 0 && (
              <ul className="divide-y divide-line">
                {items.map((u) => (
                  <li
                    key={u.id}
                    className="ui-row flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span
                          className="truncate text-base font-medium text-slate-900"
                          title={u.name}
                        >
                          {u.name}
                        </span>
                        {u.role === "ADMIN" && (
                          <Badge tone="info" uppercase>
                            admin
                          </Badge>
                        )}
                        {!u.isActive && (
                          <Badge tone="danger" uppercase>
                            inactive
                          </Badge>
                        )}
                      </div>
                      <div
                        className="mt-0.5 truncate text-xs text-slate-500"
                        title={u.email}
                      >
                        {u.email}
                        {u.lastLoginAt
                          ? ` · last sign-in ${new Date(u.lastLoginAt).toLocaleDateString()}`
                          : " · never signed in"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </AdminOnly>
    </AppShell>
  );
}
