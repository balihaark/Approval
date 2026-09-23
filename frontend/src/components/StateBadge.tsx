import type { Approval } from "@/lib/types";
import { Badge, type BadgeTone } from "./ui";

const TONE: Record<Approval["state"], BadgeTone> = {
  REGISTERED: "neutral",
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  REVOKED: "danger",
};

export function StateBadge({
  state,
  label,
}: {
  state: Approval["state"];
  label: string;
}) {
  return (
    <Badge tone={TONE[state]} dot title={label}>
      {label}
    </Badge>
  );
}
