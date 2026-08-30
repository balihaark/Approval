import { FastifyInstance } from "fastify";
import { z } from "zod";
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
import { SESSION_MAX_AGE_SECONDS } from "../config.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  mustChangePassword: boolean;
}) {
  return {
    id: user.id,
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
      const user = await prisma.user.findUnique({ where: { email } });

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
          await prisma.user.update({
            where: { id: user.id },
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

      await prisma.user.update({
        where: { id: user.id },
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

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies?.["approvals_token"];
    clearAuthCookie(reply);
    try {
      if (token) {
        const payload = app.jwt.verify<{ sub: string; email: string }>(token);
        await prisma.user.update({
          where: { id: payload.sub },
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
    return { user: publicUser(request.currentUser) };
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

      const user = await prisma.user.findUnique({
        where: { id: request.currentUser.id },
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
      const updated = await prisma.user.update({
        where: { id: user.id },
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
