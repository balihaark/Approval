import dotenv from "dotenv";
import path from "node:path";
import { existsSync } from "node:fs";
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

for (const file of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
]) {
  if (existsSync(file)) dotenv.config({ path: file });
}

const prisma = new PrismaClient();
const demoPassword = "Balihaar21123";

const demoEmployees = [
  { employeeId: 2001, email: "balihaar.kaur@blauplug.com", name: "Balihaar Kaur" },
  { employeeId: 2002, email: "abbas.shaikh@blauplug.com", name: "Abbas Shaikh" },
  { employeeId: 2003, email: "shreya.kumar@blauplug.com", name: "Shreya Kumar" },
  { employeeId: 2004, email: "chandana.rama@blauplug.com", name: "Chandana Rama" },
] as const;

async function upsertEmployee(input: {
  employeeId: number;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  mustChangePassword: boolean;
}) {
  const existing = await prisma.employee.findUnique({
    where: { email: input.email },
  });
  const data = {
    email: input.email,
    name: input.name,
    passwordHash: input.passwordHash,
    role: input.role,
    isActive: true,
    mustChangePassword: input.mustChangePassword,
    failedLoginAttempts: 0,
    lockedUntil: null,
  };

  if (existing) {
    return prisma.employee.update({
      where: { employeeId: existing.employeeId },
      data,
    });
  }

  return prisma.employee.create({
    data: { employeeId: input.employeeId, ...data },
  });
}

async function main() {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@blauplug.local";
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME || "Platform Admin";
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || "ChangeMe123!";

  await upsertEmployee({
    employeeId: 1001,
    email: adminEmail,
    name: adminName,
    passwordHash: await bcrypt.hash(adminPassword, 12),
    role: UserRole.ADMIN,
    mustChangePassword: true,
  });

  const demoPasswordHash = await bcrypt.hash(demoPassword, 12);
  for (const employee of demoEmployees) {
    await upsertEmployee({
      ...employee,
      passwordHash: demoPasswordHash,
      role: UserRole.USER,
      mustChangePassword: false,
    });
  }

  console.log("Demo employee accounts are ready.");
  console.log(`Demo password: ${demoPassword}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
