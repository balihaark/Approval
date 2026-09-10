import dotenv from "dotenv";
import path from "node:path";
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const file of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
]) {
  if (existsSync(file)) dotenv.config({ path: file });
}

// Approvals is SSO-only against Login-Auth ↔ central_db. There is no local
// password path anymore, so nothing to seed here — every Employee row is
// created on first SSO login (see routes/auth.ts). Kept as a no-op so
// `prisma db seed` and `npm run setup` don't break.
async function main() {
  const prisma = new PrismaClient();
  try {
    const count = await prisma.employee.count();
    console.log(
      `Approvals seed: SSO-only, nothing to insert. Existing employees: ${count}.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
