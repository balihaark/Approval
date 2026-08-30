"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listApprovals, type ApprovalQuery } from "@/lib/api";
import type { Approval } from "@/lib/types";
import { StateBadge } from "./StateBadge";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Select,
  SkeletonRows,
} from "./ui";
import { ChevronRight, Inbox, Search, SlidersHorizontal, X } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Short, scannable timestamp; full value stays available via tooltip. */
function relativeDate(iso: string) {
  const then = new Date(iso);
  const diffMs = Date.now() - then.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: then.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

const EMPTY_COPY: Record<string, { title: string; description: string }> = {
  received: {
    title: "No requests to review",
    description:
      "When a colleague names you as an approver — in the app or by CC’ing the monitoring inbox — their request lands here.",
  },
  sent: {
    title: "No sent requests yet",
    description:
      "Raise a request in the app, or send it by email and CC the monitoring inbox to have it tracked here.",
  },
  "part-of": {
    title: "You’re not on any threads yet",
    description:
      "Approvals where you are CC’d, but not the decision-maker, will appear in this list.",
  },
  all: {
    title: "No approvals in the system",
    description:
      "Once mail is ingested or a request is raised in the app, every record shows up here.",
  },
};

export function ApprovalList({ view }: { view: ApprovalQuery["view"] }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [department, setDepartment] = useState("");
  const [project, setProject] = useState("");
  const [participant, setParticipant] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [items, setItems] = useState<Approval[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const query = useMemo<ApprovalQuery>(
    () => ({
      view,
      q,
      state: state || undefined,
      department,
      project,
      participant,
      from,
      to,
      pageSize: 50,
    }),
    [view, q, state, department, project, participant, from, to]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listApprovals(query)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, reloadKey]);

  const activeAdvanced = [department, project, participant, from, to].filter(
    Boolean
  ).length;

  const clearFilters = useCallback(() => {
    setDepartment("");
    setProject("");
    setParticipant("");
    setFrom("");
    setTo("");
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
  }

  const empty = EMPTY_COPY[view ?? "received"] ?? EMPTY_COPY.received;

  return (
    <div className="ui-page">
      {/* Toolbar */}
      <form onSubmit={onSubmit} className="mb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search subject, body or people"
              aria-label="Search approvals"
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={state}
              onChange={(e) => setState(e.target.value)}
              aria-label="Filter by state"
              className="w-[168px]"
            >
              <option value="">All states</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="REGISTERED">Registered</option>
            </Select>
            <Button
              type="button"
              variant={showFilters || activeAdvanced ? "subtle" : "secondary"}
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
            >
              <SlidersHorizontal size={15} aria-hidden />
              Filters
              {activeAdvanced > 0 && (
                <span className="ml-0.5 rounded bg-brand-500 px-1.5 text-2xs font-semibold text-white">
                  {activeAdvanced}
                </span>
              )}
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="animate-fade-in mt-2 rounded-lg border border-line bg-surface p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Department"
                aria-label="Department"
              />
              <Input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="Project"
                aria-label="Project"
              />
              <Input
                value={participant}
                onChange={(e) => setParticipant(e.target.value)}
                placeholder="Participant email"
                aria-label="Participant email"
              />
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="Activity from date"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="Activity to date"
              />
            </div>
            {activeAdvanced > 0 && (
              <div className="mt-2.5 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                >
                  <X size={14} aria-hidden /> Clear filters
                </Button>
              </div>
            )}
          </div>
        )}
      </form>

      {/* Results */}
      <div className="ui-panel overflow-hidden">
        <div className="flex h-10 items-center justify-between gap-3 border-b border-line px-4">
          <span className="text-xs font-medium text-slate-500">
            {loading
              ? "Loading…"
              : `${total} approval${total === 1 ? "" : "s"}`}
          </span>
          {!loading && !error && items.length > 0 && (
            <span className="hidden text-2xs text-slate-400 sm:block">
              Sorted by last activity
            </span>
          )}
        </div>

        {loading && <SkeletonRows rows={6} />}

        {!loading && error && (
          <ErrorState
            title="Couldn’t load approvals"
            message={error}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={Inbox}
            title={empty.title}
            description={empty.description}
            action={
              <Link href="/new">
                <Button size="md">New request</Button>
              </Link>
            }
          />
        )}

        {!loading && !error && items.length > 0 && (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/approvals/${item.id}`}
                  className="ui-row group flex items-start gap-3 px-4 py-3 focus-visible:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-base font-semibold tracking-tightish text-slate-900 group-hover:text-brand-700">
                        {item.subject}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {item.summary || item.body}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                      <span className="truncate">
                        {item.requester?.name ||
                          item.requester?.email ||
                          "Unknown requester"}
                      </span>
                      {item.department && (
                        <Badge tone="neutral" title="Department">
                          {item.department}
                        </Badge>
                      )}
                      {item.project && (
                        <Badge tone="neutral" title="Project">
                          {item.project}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StateBadge state={item.state} label={item.stateLabel} />
                    <span
                      className="text-2xs text-slate-400"
                      title={formatDate(item.lastActivityAt)}
                    >
                      {relativeDate(item.lastActivityAt)}
                    </span>
                  </div>

                  <ChevronRight
                    size={15}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-slate-300 transition-colors duration-150 group-hover:text-slate-500"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
