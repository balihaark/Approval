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
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Production-oriented seed: bootstrap admin only.
 * Create real people in the app under Admin → People.
 */
async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@blauplug.local";
  const name = process.env.BOOTSTRAP_ADMIN_NAME || "Platform Admin";
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      role: UserRole.ADMIN,
      mustChangePassword: true,
    },
    update: {
      name,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log(`Bootstrap admin ready: ${admin.email}`);
  console.log("Change the bootstrap password on first login.");
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
