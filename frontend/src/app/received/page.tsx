"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ApprovalList } from "@/components/ApprovalList";
import { Button } from "@/components/ui";
import { PlusCircle } from "lucide-react";

export default function ReceivedPage() {
  return (
    <AppShell
      title="Received"
      subtitle="Approvals waiting on you — or that you already decided."
      actions={
        <Link href="/new">
          <Button size="md">
            <PlusCircle size={15} aria-hidden />
            <span className="hidden sm:inline">New request</span>
          </Button>
        </Link>
      }
    >
      <ApprovalList view="received" />
    </AppShell>
  );
}
