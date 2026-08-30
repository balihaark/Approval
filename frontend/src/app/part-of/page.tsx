"use client";

import { AppShell } from "@/components/AppShell";
import { ApprovalList } from "@/components/ApprovalList";

export default function PartOfPage() {
  return (
    <AppShell
      title="Part-of"
      subtitle="Threads you were CC’d on, without being the decision-maker."
    >
      <ApprovalList view="part-of" />
    </AppShell>
  );
}
