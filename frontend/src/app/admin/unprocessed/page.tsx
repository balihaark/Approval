"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AdminOnly } from "@/components/AdminOnly";
import { listUnprocessed, resolveUnprocessed } from "@/lib/api";
import type { UnprocessedMail } from "@/lib/types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  SkeletonRows,
  useToast,
} from "@/components/ui";
import { CheckCheck, Inbox } from "lucide-react";

export default function UnprocessedPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<UnprocessedMail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUnprocessed(false);
      setItems(res.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(item: UnprocessedMail) {
    setResolving(item.id);
    try {
      await resolveUnprocessed(item.id);
      await load();
      toast("Message marked as resolved.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve message");
    } finally {
      setResolving(null);
    }
  }

  return (
    <AppShell
      title="Unprocessed mail"
      subtitle="Inbound messages that could not be turned into an approval are quarantined here instead of being dropped."
    >
      <AdminOnly>
        <div className="ui-page">
          <div className="ui-panel overflow-hidden">
            <div className="ui-panel-header">
              <h2 className="ui-panel-title">
                Quarantine
                {!loading && !error && (
                  <span className="ml-2 font-normal text-slate-500">
                    {items.length}
                  </span>
                )}
              </h2>
            </div>

            {loading && <SkeletonRows rows={4} />}

            {!loading && error && (
              <ErrorState
                title="Couldn’t load the queue"
                message={error}
                onRetry={() => void load()}
              />
            )}

            {!loading && !error && items.length === 0 && (
              <EmptyState
                icon={Inbox}
                title="Queue is empty"
                description="Every inbound message either became an approval or was ignored as a system reply. Nothing needs your attention."
              />
            )}

            {!loading && !error && items.length > 0 && (
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="ui-row flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-base font-medium text-slate-900">
                        {item.subject || "(no subject)"}
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="truncate" title={item.fromAddress ?? ""}>
                          {item.fromAddress || "unknown sender"}
                        </span>
                        <Badge tone="warning" title="Why it was quarantined">
                          {item.reason}
                        </Badge>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                      {item.snippet && (
                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-400">
                          {item.snippet}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="sm:mt-0.5"
                      loading={resolving === item.id}
                      onClick={() => void resolve(item)}
                    >
                      <CheckCheck size={14} aria-hidden /> Mark resolved
                    </Button>
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
