"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AdminOnly } from "@/components/AdminOnly";
import { createUser, listUsers, patchUser } from "@/lib/api";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Panel,
  Select,
  SkeletonRows,
  useToast,
} from "@/components/ui";
import { UserPlus, Users } from "lucide-react";

type AppUser = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
};

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await createUser({ email, name, password, role });
      setEmail("");
      setName("");
      setPassword("");
      setRole("USER");
      await load();
      toast(
        "Account created. They must change the temporary password on first sign-in.",
        "success"
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: AppUser) {
    setPendingId(u.id);
    setFormError(null);
    try {
      await patchUser(u.id, { isActive: !u.isActive });
      await load();
      toast(
        u.isActive
          ? `${u.name} deactivated. Their sessions were signed out.`
          : `${u.name} reactivated.`,
        "success"
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <AppShell
      title="People"
      subtitle="Accounts that can sign in. Login emails must match the addresses used on approval mail."
    >
      <AdminOnly>
        <div className="ui-page">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              {formError && <Alert variant="error">{formError}</Alert>}

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
                    title="No accounts yet"
                    description="Create accounts for requesters and approvers so they can sign in and act on approvals."
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
                            {u.mustChangePassword && (
                              <Badge tone="warning" uppercase>
                                temp password
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
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={pendingId === u.id}
                          onClick={() => void toggleActive(u)}
                        >
                          {u.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <Panel title="Add person">
              <form onSubmit={onCreate} className="space-y-4">
                <Field label="Full name" required>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Priya Sharma"
                  />
                </Field>
                <Field
                  label="Work email"
                  required
                  hint="Must match the From / To / CC address used in Gmail."
                >
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="priya@company.com"
                  />
                </Field>
                <Field
                  label="Temporary password"
                  required
                  hint="12+ characters with upper, lower, number and symbol."
                >
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={12}
                  />
                </Field>
                <Field label="Role">
                  <Select
                    value={role}
                    onChange={(e) => setRole(e.target.value as "USER" | "ADMIN")}
                  >
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                  </Select>
                </Field>
                <Button type="submit" className="w-full" loading={busy}>
                  <UserPlus size={15} aria-hidden /> Create account
                </Button>
              </form>
            </Panel>
          </div>
        </div>
      </AdminOnly>
    </AppShell>
  );
}
