import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { assertPasswordPolicy } from "../lib/security.js";
import {
  authenticate,
  clearAuthCookie,
  setAuthCookie,
  signSessionToken,
} from "../plugins/auth.js";
import { normalizeEmail } from "../lib/access.js";
import { logActivity } from "../lib/audit.js";
import { config, SESSION_MAX_AGE_SECONDS } from "../config.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

const ssoCallbackSchema = z.object({
  token: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

function publicUser(user: {
  employeeId: number;
  email: string;
  name: string;
  role: string;
  mustChangePassword: boolean;
}) {
  return {
    id: String(user.employeeId),
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest("Email and password are required");
      }
      const email = normalizeEmail(parsed.data.email);
      const user = await prisma.employee.findUnique({ where: { email } });

      // Constant-ish work when user missing (dummy hash compare)
      const dummyHash =
        "$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G2oQh.6KzqKzqK";
      const hash = user?.passwordHash ?? dummyHash;
      const passwordOk = await verifyPassword(parsed.data.password, hash);

      if (!user || !passwordOk) {
        if (user && user.isActive) {
          const attempts = user.failedLoginAttempts + 1;
          const lockedUntil =
            attempts >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
              : user.lockedUntil;
          await prisma.employee.update({
            where: { employeeId: user.employeeId },
            data: {
              failedLoginAttempts: attempts,
              lockedUntil,
            },
          });
          await logActivity({
            actorEmail: email,
            action: "auth.login.failed",
            details: { reason: "invalid_credentials", attempts },
          });
        }
        return reply.unauthorized("Invalid email or password");
      }

      if (!user.isActive) {
        return reply.unauthorized("Invalid email or password");
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return reply.tooManyRequests(
          `Account temporarily locked. Try again after ${user.lockedUntil.toISOString()}`
        );
      }

      await prisma.employee.update({
        where: { employeeId: user.employeeId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      });

      const token = signSessionToken(app, user);
      setAuthCookie(reply, token, SESSION_MAX_AGE_SECONDS);
      await logActivity({
        actorEmail: user.email,
        action: "auth.login.success",
        details: {},
      });

      return { user: publicUser(user) };
    }
  );

  app.post(
    "/auth/sso/callback",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parsed = ssoCallbackSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest("Token is required");
      }

      let payload: any;
      try {
        payload = jwt.verify(parsed.data.token, config.loginAuthJwtSecret, {
          algorithms: ["HS256"],
          ...(config.loginAuthIssuer ? { issuer: config.loginAuthIssuer } : {}),
          ...(config.loginAuthAudience ? { audience: config.loginAuthAudience } : {}),
        });
      } catch {
        return reply.unauthorized("Invalid or expired SSO token");
      }

      if (!payload || typeof payload !== "object" || !payload.email) {
        return reply.unauthorized("Invalid SSO token claims");
      }

      const email = normalizeEmail(String(payload.email));

      let role: UserRole = UserRole.USER;
      if (
        String(payload.role ?? "").toUpperCase() === "ADMIN" ||
        String(payload.roles?.approvals ?? "").toUpperCase() === "ADMIN" ||
        String(payload.roles?.dpps ?? "").toUpperCase() === "ADMIN"
      ) {
        role = UserRole.ADMIN;
      }

      let user = await prisma.employee.findUnique({ where: { email } });

      if (user) {
        if (!user.isActive) {
          return reply.unauthorized("Account is inactive");
        }
      } else {
        const empIdFromPayload = Number(payload.emp_id || payload.central_emp_id);
        let employeeId =
          Number.isSafeInteger(empIdFromPayload) && empIdFromPayload > 0
            ? empIdFromPayload
            : 0;

        const employeeWithId = employeeId
          ? await prisma.employee.findUnique({ where: { employeeId } })
          : null;
        if (employeeWithId && employeeWithId.email !== email) {
          employeeId = 0;
        }
        if (!employeeId) {
          const maxEmp = await prisma.employee.aggregate({
            _max: { employeeId: true },
          });
          employeeId = (maxEmp._max.employeeId ?? 1000) + 1;
        }

        const dummyPasswordHash = await hashPassword(crypto.randomUUID());
        const name =
          typeof payload.first_name === "string" && payload.first_name.trim() !== ""
            ? payload.first_name.trim()
            : email.split("@")[0] || "Employee";

        user = await prisma.employee.create({
          data: {
            employeeId,
            email,
            name,
            passwordHash: dummyPasswordHash,
            role,
            mustChangePassword: false,
            tokenVersion: 1,
            isActive: true,
          },
        });
      }

      await prisma.employee.update({
        where: { employeeId: user.employeeId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      });

      const sessionToken = signSessionToken(app, user);
      setAuthCookie(reply, sessionToken, SESSION_MAX_AGE_SECONDS);

      await logActivity({
        actorEmail: user.email,
        action: "auth.sso.login.success",
        details: {
          issuer: payload.iss || "login-auth",
          empId: payload.emp_id || payload.central_emp_id || null,
        },
      });

      return { user: publicUser(user) };
    }
  );

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies?.["approvals_token"];
    clearAuthCookie(reply);
    try {
      if (token) {
        const payload = app.jwt.verify<{ sub: string; email: string }>(token);
        await prisma.employee.update({
          where: { employeeId: Number(payload.sub) },
          data: { tokenVersion: { increment: 1 } },
        });
        await logActivity({
          actorEmail: payload.email,
          action: "auth.logout",
          details: {},
        });
      }
    } catch {
      // ignore invalid cookie on logout
    }
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: authenticate }, async (request) => {
    return {
      user: publicUser({
        employeeId: request.currentUser.id,
        ...request.currentUser,
      }),
    };
  });

  app.post(
    "/auth/change-password",
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest("Current and new password are required");
      }
      const policyError = assertPasswordPolicy(parsed.data.newPassword);
      if (policyError) return reply.badRequest(policyError);

      const user = await prisma.employee.findUnique({
        where: { employeeId: request.currentUser.id },
      });
      if (!user) return reply.unauthorized("User not found");

      const ok = await verifyPassword(
        parsed.data.currentPassword,
        user.passwordHash
      );
      if (!ok) return reply.unauthorized("Current password is incorrect");

      if (parsed.data.currentPassword === parsed.data.newPassword) {
        return reply.badRequest("New password must be different");
      }

      const passwordHash = await hashPassword(parsed.data.newPassword);
      const updated = await prisma.employee.update({
        where: { employeeId: user.employeeId },
        data: {
          passwordHash,
          mustChangePassword: false,
          tokenVersion: { increment: 1 },
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      const token = signSessionToken(app, updated);
      setAuthCookie(reply, token, SESSION_MAX_AGE_SECONDS);
      await logActivity({
        actorEmail: user.email,
        action: "auth.password.changed",
        details: {},
      });

      return { user: publicUser(updated) };
    }
  );
}
