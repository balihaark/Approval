import { Prisma } from "@prisma/client";

export async function logActivity(input: {
  approvalId?: string | null;
  actorEmail: string;
  action: string;
  details?: Prisma.InputJsonValue;
}): Promise<void> {
  console.info(`[Activity] ${input.action} by ${input.actorEmail}`, {
    approvalId: input.approvalId,
    details: input.details,
  });
}
