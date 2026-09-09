"use client";

import { FormEvent, useState } from "react";
import { Plug } from "lucide-react";
import { login } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";

export default function LoginPage() {
  const { setUser, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login(email, password);
      setUser(res.user);
      window.location.assign(
        res.user.mustChangePassword ? "/account/password" : "/received"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  function onSsoClick() {
    const loginAuthUrl =
      process.env.NEXT_PUBLIC_LOGIN_AUTH_URL || "http://localhost:3002";
    const returnUrl = encodeURIComponent(
      `${window.location.origin}/sso/callback`
    );
    window.location.assign(`${loginAuthUrl}?returnUrl=${returnUrl}`);
  }

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner label="Loading…" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-brand-500 text-white">
            <Plug size={18} strokeWidth={2.25} aria-hidden />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tightish text-slate-900">
              BlauPlug Approvals
            </div>
            <div className="text-sm text-slate-500">
              Sign in with your work account
            </div>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-line bg-surface p-6 shadow-card"
        >
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            onClick={onSsoClick}
          >
            Sign in with Login-Auth
          </Button>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400">OR</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="space-y-4">
            <Field label="Work email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
          </div>

          {error && (
            <div className="mt-4">
              <Alert variant="error">{error}</Alert>
            </div>
          )}

          <Button type="submit" size="lg" className="mt-5 w-full" loading={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs leading-5 text-slate-500">
          Accounts are created by an administrator under People. Sessions last
          12 hours.
        </p>
      </div>
    </div>
  );
}
