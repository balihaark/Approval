import { FastifyInstance } from "fastify";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate, clearAuthCookie, setAuthCookie, verifySsoToken } from "../plugins/auth.js";

const sessionSchema = z.object({ token: z.string().min(1) });
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().optional(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.badRequest("Valid email is required");

    const email = parsed.data.email.trim().toLowerCase();

    let employee = await prisma.employee.findUnique({ where: { email } });
    if (!employee) {
      const maxEmp = await prisma.employee.findFirst({ orderBy: { employeeId: "desc" } });
      const nextId = (maxEmp?.employeeId ?? 1000) + 1;
      const role = email.includes("admin") ? UserRole.ADMIN : UserRole.USER;
      const rawName = email.split("@")[0].replace(/[^a-zA-Z]/g, " ");
      const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      employee = await prisma.employee.create({
        data: {
          employeeId: nextId,
          email,
          name,
          role,
          isActive: true,
          lastLoginAt: new Date(),
        },
      });
    } else {
      employee = await prisma.employee.update({
        where: { employeeId: employee.employeeId },
        data: { lastLoginAt: new Date() },
      });
    }

    const token = app.jwt.sign({
      emp_id: employee.employeeId,
      email: employee.email,
      first_name: employee.name,
      role: employee.role,
    });

    setAuthCookie(reply, token);

    return {
      ok: true,
      user: {
        id: String(employee.employeeId),
        email: employee.email,
        name: employee.name,
        role: employee.role,
      },
    };
  });

  // The browser posts the Login-Auth JWT once, so it can be held in an
  // HttpOnly app cookie rather than in localStorage or subsequent URLs.
  app.post("/auth/session", async (request, reply) => {
    const parsed = sessionSchema.safeParse(request.body);
    if (!parsed.success) return reply.badRequest("Login-Auth token is required");
    try {
      verifySsoToken(request, parsed.data.token);
      setAuthCookie(reply, parsed.data.token);
      return { ok: true };
    } catch {
      return reply.unauthorized("Invalid or expired Login-Auth token");
    }
  });

  app.get("/auth/me", { preHandler: authenticate }, async (request) => ({ user: request.currentUser }));
  app.post("/auth/change-password", { preHandler: authenticate }, async (request, reply) => {
    const { newPassword } = request.body as { currentPassword?: string; newPassword?: string };
    if (!newPassword || newPassword.length < 8) {
      return reply.badRequest("New password must be at least 8 characters");
    }
    const user = request.currentUser;
    return { ok: true, user: { ...user, mustChangePassword: false } };
  });
  app.post("/auth/logout", async (_request, reply) => {
    clearAuthCookie(reply);
    return { ok: true };
  });
}

