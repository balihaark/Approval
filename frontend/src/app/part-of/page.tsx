"use client";

import { AppShell } from "@/components/AppShell";
import { ApprovalList } from "@/components/ApprovalList";

export default function PartOfPage() {
  return (
    <AppShell
      title="Part-of"
    >
      <ApprovalList view="part-of" />
    </AppShell>
  );
}
