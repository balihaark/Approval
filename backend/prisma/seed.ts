import dotenv from "dotenv";
import path from "node:path";
import { existsSync } from "node:fs";

for (const file of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
]) {
  if (existsSync(file)) dotenv.config({ path: file });
}

import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Production-oriented seed: bootstrap admin only.
 * Create real people in the app under Admin → People.
 */
async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@blauplug.local";
  const name = process.env.BOOTSTRAP_ADMIN_NAME || "Platform Admin";

  const admin = await prisma.employee.upsert({
    where: { email },
    create: {
      employeeId: 1,
      email,
      name,
      role: UserRole.ADMIN,
      isActive: true,
    },
    update: {
      name,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log(`Bootstrap admin ready: ${admin.email}`);
  console.log("Create org users in the app (Admin → People) with real work emails.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
