import { prisma } from "./prisma.js";
import { AuthUser } from "../plugins/auth.js";

export async function userCanAccessApproval(
  user: AuthUser,
  approvalId: string
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const party = await prisma.party.findFirst({
    where: {
      approvalId,
      email: { equals: user.email, mode: "insensitive" },
    },
  });
  return Boolean(party);
}

export function partyWhereForUser(user: AuthUser) {
  if (user.role === "ADMIN") return {};
  return {
    parties: {
      some: { email: { equals: user.email, mode: "insensitive" } },
    },
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
