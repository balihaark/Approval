"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StateBadge } from "@/components/StateBadge";
import { useAuth } from "@/components/AuthProvider";
import { decide, getActivity, getApproval, updateApproval, revokeApproval, resubmitApprovalAfterRevoke } from "@/lib/api";
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
import { ArrowLeft, Check, RotateCcw, ShieldOff, X } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const ACTION_LABEL: Record<string, string> = {
  "approval.registered": "Request received",
  "approval.created.in_app": "Request created",
  "approval.pending": "Waiting for approval",
  "approval.approved": "Approved",
  "approval.rejected": "Rejected",
  "approval.revoked": "Approval revoked",
  "approval.resubmitted_after_revoke": "Resubmitted for approval",
  "approval.metadata.updated": "Details updated",
  "email.decision.sent": "Reply sent to requester",
  "email.decision.failed": "Reply email failed to send",
  "email.followup.ingested": "Follow-up email received",
};

const ROLE_TONE: Record<string, BadgeTone> = {
  REQUESTER: "info",
  APPROVER: "warning",
  PARTICIPANT: "neutral",
};

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

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
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");

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

  const turnIndex = approval ? approval.decisions.length : 0;
  const currentApprover = approval?.approvers[turnIndex];
  const hasMultipleApprovers = (approval?.approvers.length ?? 0) > 1;

  const isCurrentTurnUser =
    approval &&
    currentApprover &&
    user &&
    currentApprover.email.toLowerCase() === user.email.toLowerCase();

  const isUserAnApprover =
    approval &&
    user &&
    approval.approvers.some(
      (a) => a.email.toLowerCase() === user.email.toLowerCase()
    );

  const isAdmin = user?.role === "ADMIN";

  const isRequester =
    approval?.requester &&
    user &&
    approval.requester.email.toLowerCase() === user.email.toLowerCase();

  const canRevoke =
    approval &&
    (approval.state === "APPROVED" || approval.state === "PENDING_APPROVAL") &&
    (isRequester || isAdmin);

  const canDecideNow =
    approval &&
    approval.state === "PENDING_APPROVAL" &&
    (isCurrentTurnUser || isAdmin);

  const isWaitingForOtherTurn =
    approval &&
    approval.state === "PENDING_APPROVAL" &&
    isUserAnApprover &&
    !isCurrentTurnUser &&
    !isAdmin;

  async function handleRevoke() {
    if (!approval) return;
    if (!revokeReason.trim()) {
      setFormError("A reason is required to revoke an approval.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const res = await revokeApproval(approval.id, { reason: revokeReason.trim() });
      setApproval(res.approval);
      setShowRevokeModal(false);
      setRevokeReason("");
      if (res.emailError) {
        toast(`Revoked, but email notification failed: ${res.emailError}`, "error");
      } else {
        toast("Approval revoked successfully.", "success");
      }
      const logs = await getActivity(approval.id);
      setActivity(logs.items);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleResubmit() {
    if (!approval) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await resubmitApprovalAfterRevoke(approval.id);
      setApproval(res.approval);
      if (res.emailError) {
        toast(`Resubmitted, but email failed: ${res.emailError}`, "error");
      } else {
        toast("Request resubmitted for approval.", "success");
      }
      const logs = await getActivity(approval.id);
      setActivity(logs.items);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Resubmit failed");
    } finally {
      setBusy(false);
    }
  }

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
          <div className="flex items-center gap-2">
            {canRevoke && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowRevokeModal(true)}
              >
                <ShieldOff size={14} aria-hidden /> Revoke Approval
              </Button>
            )}
            <StateBadge state={approval.state} label={approval.stateLabel} />
          </div>
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
                          {item.action === "approval.approved" &&
                          item.details &&
                          typeof item.details === "object" &&
                          (item.details as { isLastApprover?: boolean }).isLastApprover === false
                            ? "Approved — waiting on next approver"
                            : ACTION_LABEL[item.action] || item.action}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {item.actorEmail} · {formatDate(item.createdAt)}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
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

            <div className="space-y-4">
              {formError && <Alert variant="error">{formError}</Alert>}

              {canDecideNow && (
                <Panel title={isAdmin && !isCurrentTurnUser ? "Admin Decision Override" : "Your decision"}>
                  <p className="mb-3 text-xs leading-5 text-slate-500">
                    {isAdmin && !isCurrentTurnUser
                      ? `Deciding on behalf of current turn: ${currentApprover?.name || currentApprover?.email}.`
                      : "Approve or Reject the request and state reason."}
                  </p>
                  <Field
                    label="Reason"
                    hint={isAdmin && !isCurrentTurnUser ? "Required for admin override." : undefined}
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

              {isWaitingForOtherTurn && (
                <Panel title="Decision Status">
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-amber-900">
                    <p className="text-sm font-semibold">
                      Waiting for {currentApprover?.name || currentApprover?.email} to decide first
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      Approvals are processed sequentially. It is currently {ordinal(turnIndex + 1)} approver&apos;s turn.
                    </p>
                  </div>
                </Panel>
              )}

              {approval.state === "APPROVED" && (
                <Panel title="Approval Status">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-emerald-900">
                    <p className="text-sm font-semibold flex items-center gap-1.5 text-emerald-800">
                      <Check size={16} aria-hidden /> Approved by: {approval.approvedBy || approval.decisions.filter((d) => d.decision === "APPROVED").map((d) => d.decidedBy).join(", ")}
                    </p>
                  </div>
                </Panel>
              )}

              {approval.decisions.length > 0 && (
                <Panel title="Decisions">
                  <ol className="divide-y divide-line">
                    {approval.decisions.map((d, idx) => (
                      <li key={d.id} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700">
                            {hasMultipleApprovers
                              ? `${ordinal(idx + 1)} Approver Decision`
                              : "Decision"}
                          </span>
                          <Badge tone={d.decision === "APPROVED" ? "success" : "danger"} dot>
                            {d.decision}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          By: <span className="font-medium">{d.decidedBy}</span>
                        </div>
                        {d.reason && (
                          <p className="mt-1 text-xs italic text-slate-500">
                            &quot;{d.reason}&quot;
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </Panel>
              )}

              {approval.state === "REVOKED" && (
                <Panel title="Revocation Details">
                  <div className="rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-red-900">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
                      <ShieldOff size={16} aria-hidden /> ✗ This approval was revoked
                    </div>
                    {approval.revokeReason && (
                      <p className="mt-2 text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">Reason:</span> {approval.revokeReason}
                      </p>
                    )}
                    {approval.revokedBy && (
                      <p className="mt-1 text-xs text-slate-500">
                        Revoked by: {approval.revokedBy}
                      </p>
                    )}
                    {isRequester && (
                      <div className="mt-3 border-t border-red-200/60 pt-3">
                        <Button
                          variant="primary"
                          className="w-full"
                          loading={busy}
                          onClick={() => void handleResubmit()}
                        >
                          <RotateCcw size={15} aria-hidden /> Resubmit for Approval
                        </Button>
                      </div>
                    )}
                  </div>
                </Panel>
              )}

              <Panel title="Parties">
                <ul className="space-y-3">
                  {approval.parties.map((p) => {
                    let seqLabel = "";
                    let statusBadge = null;
                    if (p.role === "APPROVER") {
                      const order = p.sequenceOrder ?? approval.approvers.findIndex((a) => a.email.toLowerCase() === p.email.toLowerCase());
                      seqLabel =
                        hasMultipleApprovers && order >= 0
                          ? `${ordinal(order + 1)} approver`
                          : "approver";

                      if (order >= 0 && order < approval.decisions.length) {
                        const d = approval.decisions[order];
                        statusBadge = (
                          <Badge tone={d.decision === "APPROVED" ? "success" : "danger"}>
                            {d.decision === "APPROVED" ? "Approved" : "Rejected"}
                          </Badge>
                        );
                      } else if (order === turnIndex && approval.state === "PENDING_APPROVAL") {
                        statusBadge = <Badge tone="warning">Current Turn</Badge>;
                      } else if (approval.state === "PENDING_APPROVAL") {
                        statusBadge = <Badge tone="neutral">Waiting</Badge>;
                      }
                    }

                    return (
                      <li key={`${p.role}-${p.email}`} className="min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-base font-medium text-slate-900">
                            {p.name || p.email}
                          </span>
                          {statusBadge}
                        </div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                          <Badge tone={ROLE_TONE[p.role] ?? "neutral"} uppercase>
                            {p.role === "APPROVER" ? seqLabel : p.role.toLowerCase()}
                          </Badge>
                          <span
                            className="truncate text-xs text-slate-500"
                            title={p.email}
                          >
                            {p.email}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </div>
          </div>
        )}

        {showRevokeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-modal">
              <h2 className="text-lg font-semibold text-slate-900">Revoke Approval</h2>
              <p className="mt-1.5 rounded border border-amber-200 bg-amber-50 p-2 text-xs font-medium text-amber-800">
                Are you sure? All approvers will be notified.
              </p>
              <div className="mt-4">
                <Field label="Revocation Reason" hint="Required" required>
                  <Textarea
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    placeholder="Explain why this approval is being revoked…"
                    rows={3}
                  />
                </Field>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setShowRevokeModal(false);
                    setRevokeReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  loading={busy}
                  onClick={() => void handleRevoke()}
                >
                  Confirm Revoke
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
