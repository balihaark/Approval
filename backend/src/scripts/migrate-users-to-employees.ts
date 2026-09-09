/**
 * One-shot migration script: copies User records into the Employee table.
 *
 * Run with:  npx tsx src/scripts/migrate-users-to-employees.ts
 *
 * NOTE: This script is for use when migrating FROM a schema that had a separate
 * User table. The current schema uses Employee as the sole identity table.
 * If the User model no longer exists, this script will report that and exit cleanly.
 *
 * This is a standalone utility; it is NOT wired into any route.
 */

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

async function main(): Promise<void> {
  console.log("Starting migration check: User table → Employee table...");

  // Check if a 'user' table still exists in the DB directly
  // (the Prisma schema no longer has a User model, so we query raw)
  let userRows: Array<{
    id: number;
    email: string;
    name: string;
    role: string;
    is_active: boolean;
    created_at: Date;
  }> = [];

  try {
    userRows = await prisma.$queryRaw`
      SELECT id, email, name, role, is_active, created_at
      FROM "User"
      ORDER BY id ASC
    `;
  } catch {
    console.log(
      '[INFO] No "User" table found in the database — schema has already been fully migrated.'
    );
    return;
  }

  console.log(`Found ${userRows.length} row(s) in the legacy "User" table.`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const user of userRows) {
    const existingEmployee = await prisma.employee.findUnique({
      where: { email: user.email },
    });

    if (existingEmployee) {
      console.log(`[SKIP] Employee with email '${user.email}' already exists.`);
      skippedCount++;
      continue;
    }

    const newEmployee = await prisma.employee.create({
      data: {
        employeeId: user.id,
        email: user.email,
        name: user.name,
        role: user.role === "ADMIN" ? "ADMIN" : "USER",
        isActive: user.is_active,
        createdAt: user.created_at ?? new Date(),
      },
    });

    console.log(
      `[MIGRATED] Created employee ID '${newEmployee.employeeId}' for email '${newEmployee.email}'.`
    );
    migratedCount++;
  }

  console.log("-----------------------------------------");
  console.log(
    `Migration complete. Migrated: ${migratedCount}, Skipped: ${skippedCount}, Total: ${userRows.length}`
  );
}

main()
  .catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
