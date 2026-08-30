"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StateBadge } from "@/components/StateBadge";
import { useAuth } from "@/components/AuthProvider";
import { decide, getActivity, getApproval, updateApproval } from "@/lib/api";
import type { ActivityItem, Approval } from "@/lib/types";
import {
  Alert,
  Badge,
  Button,
  DataItem,
  ErrorState,
  Field,
  Input,
  Panel,
  Skeleton,
  Textarea,
  useToast,
  type BadgeTone,
} from "@/components/ui";
import { ArrowLeft, Check, X } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const ACTION_LABEL: Record<string, string> = {
  "approval.registered": "Registered from email",
  "approval.created.in_app": "Created in app and emailed",
  "approval.pending": "Moved to pending approval",
  "approval.approved": "Approved",
  "approval.rejected": "Rejected",
  "approval.metadata.updated": "Updated department/project",
  "email.decision.sent": "Decision email sent on the original thread",
  "email.decision.failed": "Decision email failed to send",
  "email.followup.ingested": "Follow-up email ingested on this thread",
};

const ROLE_TONE: Record<string, BadgeTone> = {
  REQUESTER: "info",
  APPROVER: "warning",
  PARTICIPANT: "neutral",
};

export default function ApprovalDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [approval, setApproval] = useState<Approval | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [dept, setDept] = useState("");
  const [project, setProject] = useState("");

  const reload = useCallback(async () => {
    const [a, logs] = await Promise.all([
      getApproval(params.id),
      getActivity(params.id),
    ]);
    setApproval(a);
    setActivity(logs.items);
    setDept(a.department ?? "");
    setProject(a.project ?? "");
    setLoadError(null);
  }, [params.id]);

  useEffect(() => {
    reload().catch((err: Error) => setLoadError(err.message));
  }, [reload]);

  const canDecide =
    approval &&
    approval.state === "PENDING_APPROVAL" &&
    user &&
    (user.role === "ADMIN" ||
      approval.approvers.some(
        (a) => a.email.toLowerCase() === user.email.toLowerCase()
      ));

  async function onDecide(decision: "approved" | "rejected") {
    if (!approval) return;
    if (decision === "rejected" && !reason.trim()) {
      setFormError("A reason is required when rejecting.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const res = await decide(approval.id, decision, reason.trim() || undefined);
      setApproval(res.approval);
      if (res.emailError) {
        toast(
          `Decision saved, but the Gmail reply failed: ${res.emailError}`,
          "error"
        );
      } else {
        toast(
          decision === "approved" ? "Request approved." : "Request rejected.",
          "success"
        );
      }
      const logs = await getActivity(approval.id);
      setActivity(logs.items);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveMeta(e: FormEvent) {
    e.preventDefault();
    if (!approval) return;
    setBusy(true);
    setFormError(null);
    try {
      const updated = await updateApproval(approval.id, {
        department: dept || null,
        project: project || null,
      });
      setApproval(updated);
      toast("Classification saved.", "success");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={approval?.subject ?? "Approval"}
      subtitle={
        approval
          ? `Opened ${formatDate(approval.createdAt)} · Last activity ${formatDate(
              approval.lastActivityAt
            )}`
          : undefined
      }
      actions={
        approval ? (
          <StateBadge state={approval.state} label={approval.stateLabel} />
        ) : undefined
      }
    >
      <div className="ui-page">
        <Link
          href="/received"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors duration-150 hover:text-slate-900"
        >
          <ArrowLeft size={14} aria-hidden /> Back to Received
        </Link>

        {loadError && !approval ? (
          <div className="ui-panel">
            <ErrorState
              title="Couldn’t load this approval"
              message={loadError}
              onRetry={() => void reload().catch((e: Error) => setLoadError(e.message))}
            />
          </div>
        ) : !approval ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="ui-panel space-y-3 p-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <div className="ui-panel space-y-3 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <div className="ui-panel space-y-3 p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Panel title="Request">
                <pre className="whitespace-pre-wrap break-words font-sans text-base leading-6 text-slate-700">
                  {approval.body}
                </pre>
              </Panel>

              <Panel title="Activity">
                {activity.length === 0 ? (
                  <p className="text-sm text-slate-500">No activity recorded yet.</p>
                ) : (
                  <ol className="relative space-y-4 border-l border-line pl-4">
                    {activity.map((item) => (
                      <li key={item.id} className="relative">
                        <span
                          aria-hidden
                          className="absolute -left-[1.32rem] top-1.5 h-2 w-2 rounded-full border-2 border-white bg-brand-500"
                        />
                        <div className="text-base font-medium text-slate-900">
                          {ACTION_LABEL[item.action] || item.action}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {item.actorEmail} · {formatDate(item.createdAt)}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            </div>

            <div className="space-y-4">
              {formError && <Alert variant="error">{formError}</Alert>}

              {canDecide && (
                <Panel title="Your decision">
                  <p className="mb-3 text-xs leading-5 text-slate-500">
                    Decisions are recorded in the app. A reply is then sent on
                    the original email thread.
                  </p>
                  <Field
                    label="Reason"
                    hint="Required when rejecting; optional when approving."
                  >
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Add context for the requester…"
                      rows={3}
                    />
                  </Field>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="success"
                      className="flex-1"
                      loading={busy}
                      onClick={() => void onDecide("approved")}
                    >
                      <Check size={15} aria-hidden /> Approve
                    </Button>
                    <Button
                      variant="danger"
                      className="flex-1"
                      loading={busy}
                      onClick={() => void onDecide("rejected")}
                    >
                      <X size={15} aria-hidden /> Reject
                    </Button>
                  </div>
                </Panel>
              )}

              {approval.decisions[0] && (
                <Panel title="Decision">
                  <dl className="space-y-3">
                    <DataItem
                      label="Outcome"
                      value={
                        <Badge
                          tone={
                            approval.decisions[0].decision === "APPROVED"
                              ? "success"
                              : "danger"
                          }
                          dot
                        >
                          {approval.decisions[0].decision}
                        </Badge>
                      }
                    />
                    <DataItem
                      label="Decided by"
                      value={approval.decisions[0].decidedBy}
                    />
                    {approval.decisions[0].reason && (
                      <div>
                        <dt className="ui-section-label">Reason</dt>
                        <dd className="mt-1 text-base leading-6 text-slate-700">
                          {approval.decisions[0].reason}
                        </dd>
                      </div>
                    )}
                  </dl>
                </Panel>
              )}

              <Panel title="Parties">
                <ul className="space-y-3">
                  {approval.parties.map((p) => (
                    <li key={`${p.role}-${p.email}`} className="min-w-0">
                      <div className="truncate text-base font-medium text-slate-900">
                        {p.name || p.email}
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                        <Badge tone={ROLE_TONE[p.role] ?? "neutral"} uppercase>
                          {p.role.toLowerCase()}
                        </Badge>
                        <span
                          className="truncate text-xs text-slate-500"
                          title={p.email}
                        >
                          {p.email}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Classification">
                <form onSubmit={onSaveMeta} className="space-y-3">
                  <Field label="Department">
                    <Input
                      value={dept}
                      onChange={(e) => setDept(e.target.value)}
                      placeholder="e.g. Hardware"
                    />
                  </Field>
                  <Field label="Project">
                    <Input
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                      placeholder="e.g. Q3 rollout"
                    />
                  </Field>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    loading={busy}
                  >
                    Save
                  </Button>
                </form>
              </Panel>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
