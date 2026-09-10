"use client";

import { Plug } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Button, Spinner } from "@/components/ui";

export default function LoginPage() {
  const { user, loading } = useAuth();

  function onWorkspaceClick() {
    // Approvals is entered through the bpi-main workspace launcher — not a
    // standalone Login-Auth button. The launcher (/dashboard/employee) opens
    // /app-verify?appId=Approvals&appUrl=<approvals>/sso/callback, exchanges
    // the main SSO token for a per-app JWT via Login-Auth /auth/generate-app-token
    // (Approvals must be in that whitelist), then redirects back here with
    // ?token=<JWT> which /sso/callback verifies.
    const workspaceUrl =
      process.env.NEXT_PUBLIC_BPI_MAIN_URL || "https://blauplug.company";
    window.location.assign(`${workspaceUrl}/dashboard/employee`);
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
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-brand-500 text-white">
            <Plug size={18} strokeWidth={2.25} aria-hidden />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tightish text-slate-900">
              BlauPlug Approvals
            </div>
            <div className="text-sm text-slate-500">
              Sign in from your BlauPlug workspace
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
          <p className="mb-4 text-sm leading-6 text-slate-600">
            Approvals opens through your BlauPlug workspace. Sign in there,
            then click the <strong>Approvals</strong> tile — you&rsquo;ll be
            asked for your 6-digit authenticator code and dropped straight
            back into the app.
          </p>
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={onWorkspaceClick}
          >
            Open BlauPlug workspace
          </Button>
        </div>

        <p className="mt-4 text-center text-xs leading-5 text-slate-500">
          Accounts are managed in the central directory. Contact HR if you
          need access. Sessions last 12 hours.
        </p>
      </div>
    </div>
  );
}
