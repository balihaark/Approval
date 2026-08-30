"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { changePassword } from "@/lib/api";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { ShieldCheck } from "lucide-react";

export default function ChangePasswordPage() {
  const { user, setUser, loading, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await changePassword(currentPassword, newPassword);
      setUser(res.user);
      window.location.assign("/received");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner label="Loading…" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
            <ShieldCheck size={18} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold tracking-tightish text-slate-900">
              {user.mustChangePassword ? "Set a new password" : "Change password"}
            </div>
            <div className="truncate text-sm text-slate-500" title={user.email}>
              {user.email}
            </div>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-line bg-surface p-6 shadow-card"
        >
          {user.mustChangePassword && (
            <div className="mb-4">
              <Alert variant="warning" title="Password change required">
                Set your own password before using the workspace.
              </Alert>
            </div>
          )}

          <div className="space-y-4">
            <Field label="Current password">
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
            <Field
              label="New password"
              hint="At least 12 characters with upper and lowercase, a number, and a symbol."
            >
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
                invalid={Boolean(confirm) && confirm !== newPassword}
              />
            </Field>
          </div>

          {error && (
            <div className="mt-4">
              <Alert variant="error">{error}</Alert>
            </div>
          )}

          <Button type="submit" size="lg" className="mt-5 w-full" loading={busy}>
            {busy ? "Saving…" : "Update password"}
          </Button>
          {!user.mustChangePassword && (
            <Button
              type="button"
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => void logout()}
            >
              Sign out
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
