"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AdminOnly } from "@/components/AdminOnly";
import {
  adminStats,
  gmailReconcile,
  gmailStatus,
  gmailWatch,
  startGmailOauth,
} from "@/lib/api";
import {
  Alert,
  Badge,
  Button,
  DataItem,
  Panel,
  Skeleton,
  useToast,
} from "@/components/ui";
import { Link2, Radio, RefreshCw } from "lucide-react";

type Status = Awaited<ReturnType<typeof gmailStatus>>;
type Stats = Awaited<ReturnType<typeof adminStats>>;

function StatCard({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3 shadow-card">
      <div className="ui-section-label">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tightish text-slate-900">
        {value ?? <Skeleton className="h-6 w-10" />}
      </div>
    </div>
  );
}

export default function GmailAdminPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([gmailStatus(), adminStats()]);
      setStatus(s);
      setStats(st);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Gmail status");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(
    key: string,
    fn: () => Promise<unknown>,
    successMessage: string
  ) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
      toast(successMessage, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell
      title="Gmail"
      subtitle="Ingestion for the monitored mailbox. Decisions are always recorded in the app."
      actions={
        status ? (
          <Badge tone={status.configured ? "success" : "warning"} dot>
            {status.configured ? "Connected" : "Not connected"}
          </Badge>
        ) : undefined
      }
    >
      <AdminOnly>
        <div className="ui-page space-y-4">
          {error && <Alert variant="error">{error}</Alert>}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Approvals" value={stats?.approvals} />
            <StatCard label="Pending" value={stats?.pending} />
            <StatCard label="Unprocessed" value={stats?.unprocessed} />
            <StatCard label="Active users" value={stats?.users} />
          </div>

          <Panel
            title="Connection"
            description="OAuth, Pub/Sub push and the reconcile sweep."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  loading={busy === "oauth"}
                  onClick={() =>
                    void run(
                      "oauth",
                      async () => {
                        const r = await startGmailOauth();
                        window.open(r.url, "_blank", "noopener,noreferrer");
                      },
                      "Google consent opened in a new tab."
                    )
                  }
                >
                  <Link2 size={15} aria-hidden /> Connect
                </Button>
                <Button
                  variant="secondary"
                  loading={busy === "reconcile"}
                  onClick={() =>
                    void run("reconcile", gmailReconcile, "Reconcile sweep finished.")
                  }
                >
                  <RefreshCw size={15} aria-hidden /> Reconcile
                </Button>
                <Button
                  variant="secondary"
                  loading={busy === "watch"}
                  onClick={() =>
                    void run("watch", gmailWatch, "Gmail watch renewed.")
                  }
                >
                  <Radio size={15} aria-hidden /> Renew watch
                </Button>
              </div>
            }
          >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <DataItem
                label="Mailbox"
                value={status?.user ?? "—"}
              />
              <DataItem
                label="Pub/Sub topic"
                value={status ? (status.hasPubsubTopic ? "Configured" : "Missing") : "—"}
              />
              <DataItem
                label="History id"
                value={status?.historyId ?? "—"}
                mono
              />
              <DataItem
                label="Watch expiry"
                value={
                  status?.watchExpiry
                    ? new Date(status.watchExpiry).toLocaleString()
                    : "—"
                }
              />
              <DataItem
                label="Last reconcile"
                value={
                  status?.lastReconcileAt
                    ? new Date(status.lastReconcileAt).toLocaleString()
                    : "—"
                }
              />
            </dl>
          </Panel>

          <Panel title="How ingestion works">
            <div className="space-y-3 text-base leading-6 text-slate-600">
              <p>
                Colleagues keep emailing approvals the way they do today and CC{" "}
                <code className="ui-code">
                  {status?.user || "the monitored mailbox"}
                </code>
                . The app creates a record from that thread, approvers decide
                here, and the decision is sent as a reply on the same thread.
              </p>
              <p>
                Create every participant under <strong className="font-semibold text-slate-800">People</strong>{" "}
                with the address they use in Gmail. Pub/Sub push gives
                near-real-time ingest; the reconcile sweep is the safety net if a
                push is missed.
              </p>
            </div>
          </Panel>
        </div>
      </AdminOnly>
    </AppShell>
  );
}
