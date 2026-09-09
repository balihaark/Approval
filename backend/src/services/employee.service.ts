import { prisma } from "../lib/prisma.js";
import { UserRole } from "@prisma/client";

/**
 * Service & Repository layer encapsulating Employee database access.
 * This abstracts data fetching during authentication so it can be swapped cleanly
 * for Central DB API endpoints in the future.
 *
 * NOTE: The legacy User table has been removed from the schema. Identity is now
 * owned entirely by the Employee table (sourced from Login-Auth SSO).
 */
export class EmployeeService {
  async findByEmail(email: string) {
    return prisma.employee.findUnique({ where: { email } });
  }

  async findById(employeeId: number) {
    return prisma.employee.findUnique({ where: { employeeId } });
  }

  async onLoginSuccess(employeeId: number): Promise<void> {
    await prisma.employee.update({
      where: { employeeId },
      data: { lastLoginAt: new Date() },
    });
  }

  async upsertFromSso(
    employeeId: number,
    email: string,
    name: string,
    role: UserRole,
    passwordHash: string
  ) {
    return prisma.employee.upsert({
      where: { employeeId },
      create: { employeeId, email, name, role, passwordHash, isActive: true, lastLoginAt: new Date() },
      update: { email, name, role, passwordHash, isActive: true, lastLoginAt: new Date() },
    });
  }
}

export const employeeService = new EmployeeService();
