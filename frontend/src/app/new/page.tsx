"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { createApproval } from "@/lib/api";
import {
  Alert,
  Button,
  Field,
  Input,
  Panel,
  Textarea,
  useToast,
} from "@/components/ui";
import { Send } from "lucide-react";

function splitEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function NewRequestPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [approvers, setApprovers] = useState("");
  const [participants, setParticipants] = useState("");
  const [department, setDepartment] = useState("");
  const [project, setProject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const to = splitEmails(approvers);
      if (!to.length) {
        setError("Add at least one approver email.");
        setBusy(false);
        return;
      }
      const res = await createApproval({
        subject: subject.trim(),
        body: body.trim(),
        approvers: to,
        participants: splitEmails(participants),
        department: department.trim() || null,
        project: project.trim() || null,
      });
      toast("Request created and emailed to the approver(s).", "success");
      router.push(`/approvals/${res.approval.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="New request"
      subtitle="Creates the approval record and emails the approver(s) from the monitoring inbox."
    >
      <div className="ui-page-narrow">
        <form onSubmit={onSubmit} className="space-y-4">
          <Panel title="Request">
            <div className="space-y-4">
              <Field label="Subject" required>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  maxLength={500}
                  placeholder="Short summary of what you need approved"
                />
              </Field>
              <Field
                label="Request details"
                required
                hint="Approvers see this text in the app and in the email."
              >
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  required
                  placeholder="Describe the request clearly…"
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Recipients">
            <div className="space-y-4">
              <Field
                label="Approvers (To)"
                required
                hint="Comma-separated. Must differ from you and the monitoring inbox."
              >
                <Input
                  value={approvers}
                  onChange={(e) => setApprovers(e.target.value)}
                  placeholder="manager@company.com"
                  required
                />
              </Field>
              <Field
                label="CC / participants"
                hint="Optional. They can follow the thread but cannot decide."
              >
                <Input
                  value={participants}
                  onChange={(e) => setParticipants(e.target.value)}
                  placeholder="teammate@company.com"
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Classification">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department">
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
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
            </div>
          </Panel>

          {error && <Alert variant="error">{error}</Alert>}

          <div className="flex items-center gap-3 pb-2">
            <Button type="submit" size="lg" loading={busy}>
              <Send size={15} aria-hidden />
              {busy ? "Sending…" : "Send request"}
            </Button>
            <span className="text-xs text-slate-500">
              An email is sent immediately; the decision reply stays on the same
              thread.
            </span>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
