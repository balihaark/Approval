import dotenv from "dotenv";
import path from "node:path";
import { existsSync } from "node:fs";

for (const file of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
]) {
  if (existsSync(file)) dotenv.config({ path: file });
}

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Demo / placeholder accounts that should not remain in an org deployment */
const SEED_USER_EMAILS = [
  "ravi@blauplug.local",
  "priya@blauplug.local",
  "ananya@blauplug.local",
  "you@gmail.com",
  "friend@gmail.com",
  "temp-fix-check@example.com",
];

async function main() {
  const seedApprovals = await prisma.approval.findMany({
    where: {
      OR: [
        { threadId: { startsWith: "local-thread-seed" } },
        { messageId: { endsWith: "@approvals.local>" } },
        { gmailMessageId: { startsWith: "seed-" } },
      ],
    },
    select: { id: true, threadId: true },
  });
  const seedApprovalIds = seedApprovals.map((a) => a.id);

  if (seedApprovalIds.length) {
    await prisma.decision.deleteMany({
      where: { approvalId: { in: seedApprovalIds } },
    });
    await prisma.party.deleteMany({
      where: { approvalId: { in: seedApprovalIds } },
    });
    await prisma.approval.deleteMany({
      where: { id: { in: seedApprovalIds } },
    });
  }

  const unprocessed = await prisma.unprocessedMail.deleteMany({
    where: {
      OR: [
        { gmailMessageId: { startsWith: "seed-" } },
        { threadId: { startsWith: "local-thread-" } },
      ],
    },
  });

  const employees = await prisma.employee.deleteMany({
    where: { email: { in: SEED_USER_EMAILS } },
  });

  // Keep bootstrap admin; ensure it still exists for first login
  const admin = await prisma.employee.findUnique({
    where: { email: "admin@blauplug.local" },
  });

  console.log(
    JSON.stringify(
      {
        removedSeedApprovals: seedApprovals.map((a) => a.threadId),
        removedUnprocessed: unprocessed.count,
        removedEmployees: employees.count,
        remainingAdmin: Boolean(admin),
        remainingApprovals: await prisma.approval.count(),
        remainingEmployees: await prisma.employee.count(),
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
