"use client";

import { useAuth } from "./AuthProvider";
import { ShieldAlert } from "lucide-react";
import { EmptyState, Spinner } from "./ui";

/** Client-side admin gate. The API independently enforces the ADMIN role. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="ui-page">
        <div className="ui-panel">
          <EmptyState
            icon={ShieldAlert}
            title="Access restricted"
            description="This area is available to administrators only. Ask an admin if you need access to Gmail settings, People, or the unprocessed queue."
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
