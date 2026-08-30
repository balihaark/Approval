"use client";

import { AppShell } from "@/components/AppShell";
import { AdminOnly } from "@/components/AdminOnly";
import { ApprovalList } from "@/components/ApprovalList";

export default function AllApprovalsPage() {
  return (
    <AppShell
      title="All approvals"
      subtitle="Admin view of every record in the system."
    >
      <AdminOnly>
        <ApprovalList view="all" />
      </AdminOnly>
    </AppShell>
  );
}
