import { prisma } from "./prisma.js";
import { Prisma } from "@prisma/client";

export async function logActivity(input: {
  approvalId?: string | null;
  actorEmail: string;
  action: string;
  details?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.activityLog.create({
    data: {
      approvalId: input.approvalId ?? null,
      actorEmail: input.actorEmail,
      action: input.action,
      details: input.details ?? Prisma.JsonNull,
    },
  });
}
