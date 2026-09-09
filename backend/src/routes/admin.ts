import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../plugins/auth.js";
import { config, gmailConfigured } from "../config.js";
import { ParsedMessage } from "../lib/gmail/parser.js";
import {
  ingestParsedMessage,
  reconcileRecent,
  handlePushNotification,
} from "../lib/gmail/ingestion.js";
import { renewGmailWatch } from "../lib/gmail/watch.js";
import { logActivity } from "../lib/audit.js";
import { hashPassword } from "../lib/password.js";
import { assertPasswordPolicy } from "../lib/security.js";
import { normalizeEmail } from "../lib/access.js";

const simulateSchema = z.object({
  from: z.string(),
  to: z.array(z.string()).min(1),
  cc: z.array(z.string()).optional(),
  subject: z.string(),
  body: z.string(),
  department: z.string().optional(),
  project: z.string().optional(),
});

const createUserSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(200),
  password: z.string().min(12).max(128),
  role: z.enum(["USER", "ADMIN"]).optional(),
});

const patchUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  mustChangePassword: z.boolean().optional(),
  resetPassword: z.string().min(12).max(128).optional(),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/admin/unprocessed",
    { preHandler: requireAdmin },
    async (request) => {
      const query = request.query as { resolved?: string };
      const includeResolved = query.resolved === "true";
      const items = await prisma.unprocessedMail.findMany({
        where: includeResolved ? {} : { resolvedAt: null },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return { items };
    }
  );

  app.post(
    "/admin/unprocessed/:id/resolve",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await prisma.unprocessedMail.findUnique({
        where: { id },
      });
      if (!existing) return reply.notFound("Not found");
      const updated = await prisma.unprocessedMail.update({
        where: { id },
        data: {
          resolvedAt: new Date(),
          resolvedBy: request.currentUser.email,
        },
      });
      await logActivity({
        actorEmail: request.currentUser.email,
        action: "unprocessed.resolved",
        details: { id, gmailMessageId: existing.gmailMessageId },
      });
      return updated;
    }
  );

  app.post(
    "/admin/simulate-email",
    { preHandler: requireAdmin },
    async (request, reply) => {
      if (!config.allowSimulateEmail) {
        return reply.forbidden("Email simulation is disabled in this environment");
      }
      const body = simulateSchema.safeParse(request.body);
      if (!body.success) return reply.badRequest("Invalid payload");
      const now = Date.now();
      const parsed: ParsedMessage = {
        gmailMessageId: `local-${now}`,
        threadId: `local-thread-${now}`,
        messageIdHeader: `<local-${now}@approvals.local>`,
        inReplyTo: null,
        references: null,
        subject: body.data.subject,
        from: { email: body.data.from.toLowerCase(), name: null },
        to: body.data.to.map((e) => ({ email: e.toLowerCase(), name: null })),
        cc: (body.data.cc ?? []).map((e) => ({
          email: e.toLowerCase(),
          name: null,
        })),
        date: new Date(),
        bodyText: [
          body.data.department ? `Department: ${body.data.department}` : "",
          body.data.project ? `Project: ${body.data.project}` : "",
          body.data.body,
        ]
          .filter(Boolean)
          .join("\n"),
        snippet: body.data.body.slice(0, 180),
        department: body.data.department ?? null,
        project: body.data.project ?? null,
        isAutoReply: false,
        isFromMonitorInbox: false,
      };
      const result = await ingestParsedMessage(
        parsed,
        request.currentUser.email
      );
      return result;
    }
  );

  app.post(
    "/admin/gmail/reconcile",
    { preHandler: requireAdmin },
    async (_request, reply) => {
      if (!gmailConfigured()) {
        return reply.badRequest("Gmail is not configured");
      }
      const state = await prisma.gmailSyncState.findUnique({
        where: { id: "default" },
      });
      if (state?.historyId) {
        const result = await handlePushNotification(state.historyId);
        return { mode: "history", result };
      }
      const result = await reconcileRecent(50);
      return { mode: "list", result };
    }
  );

  app.post(
    "/admin/gmail/watch",
    { preHandler: requireAdmin },
    async (_request, reply) => {
      if (!gmailConfigured()) {
        return reply.badRequest("Gmail is not configured");
      }
      const result = await renewGmailWatch();
      return result;
    }
  );

  app.get("/admin/gmail/status", { preHandler: requireAdmin }, async () => {
    const state = await prisma.gmailSyncState.findUnique({
      where: { id: "default" },
    });
    return {
      configured: gmailConfigured(),
      user: config.gmail.user,
      hasPubsubTopic: Boolean(config.gmail.pubsubTopic),
      historyId: state?.historyId ?? null,
      watchExpiry: state?.watchExpiry ?? null,
      lastReconcileAt: state?.lastReconcileAt ?? null,
    };
  });

  app.get("/admin/stats", { preHandler: requireAdmin }, async () => {
    const [approvals, pending, unprocessed, users] = await Promise.all([
      prisma.approval.count(),
      prisma.approval.count({ where: { state: "PENDING_APPROVAL" } }),
      prisma.unprocessedMail.count({ where: { resolvedAt: null } }),
      prisma.employee.count({ where: { isActive: true } }),
    ]);
    return { approvals, pending, unprocessed, users };
  });

  app.get("/admin/users", { preHandler: requireAdmin }, async () => {
    const users = await prisma.employee.findMany({
      orderBy: { email: "asc" },
      select: {
        employeeId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        lockedUntil: true,
        createdAt: true,
      },
    });
    return { items: users.map(({ employeeId, ...user }) => ({ id: String(employeeId), ...user })) };
  });

  app.post("/admin/users", { preHandler: requireAdmin }, async (request, reply) => {
    const body = createUserSchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest(
        "email, name, and a strong password (12+ chars, mixed case, number, symbol) are required"
      );
    }
    const policyError = assertPasswordPolicy(body.data.password);
    if (policyError) return reply.badRequest(policyError);

    const email = normalizeEmail(body.data.email);
    const existing = await prisma.employee.findUnique({ where: { email } });
    if (existing) return reply.conflict("A user with that email already exists");
    const lastEmployee = await prisma.employee.findFirst({
      orderBy: { employeeId: "desc" },
      select: { employeeId: true },
    });
    const user = await prisma.employee.create({
      data: {
        employeeId: (lastEmployee?.employeeId ?? 1000) + 1,
        email,
        name: body.data.name.trim(),
        passwordHash: await hashPassword(body.data.password),
        role: body.data.role ?? "USER",
        mustChangePassword: true,
      },
      select: {
        employeeId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });
    await logActivity({
      actorEmail: request.currentUser.email,
      action: "user.created",
      details: { email: user.email, role: user.role },
    });
    const { employeeId, ...publicUser } = user;
    return { user: { id: String(employeeId), ...publicUser } };
  });

  app.patch(
    "/admin/users/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const employeeId = Number(id);
      if (!Number.isSafeInteger(employeeId)) return reply.badRequest("Invalid employee ID");
      const body = patchUserSchema.safeParse(request.body);
      if (!body.success) return reply.badRequest("Invalid payload");

      const target = await prisma.employee.findUnique({ where: { employeeId } });
      if (!target) return reply.notFound("User not found");

      if (body.data.isActive === false && target.employeeId === request.currentUser.id) {
        return reply.badRequest("You cannot deactivate your own account");
      }

      if (
        (body.data.role === "USER" || body.data.isActive === false) &&
        target.role === "ADMIN"
      ) {
        const adminCount = await prisma.employee.count({
          where: { role: "ADMIN", isActive: true },
        });
        const wouldLoseAdmin =
          body.data.role === "USER" || body.data.isActive === false;
        if (wouldLoseAdmin && adminCount <= 1) {
          return reply.badRequest("Cannot remove or deactivate the last admin");
        }
      }

      if (body.data.resetPassword) {
        const policyError = assertPasswordPolicy(body.data.resetPassword);
        if (policyError) return reply.badRequest(policyError);
      }

      const user = await prisma.employee.update({
        where: { employeeId },
        data: {
          ...(body.data.isActive !== undefined
            ? { isActive: body.data.isActive }
            : {}),
          ...(body.data.role !== undefined ? { role: body.data.role } : {}),
          ...(body.data.mustChangePassword !== undefined
            ? { mustChangePassword: body.data.mustChangePassword }
            : {}),
          ...(body.data.resetPassword
            ? {
                passwordHash: await hashPassword(body.data.resetPassword),
                mustChangePassword: true,
                tokenVersion: { increment: 1 },
                failedLoginAttempts: 0,
                lockedUntil: null,
              }
            : {}),
          ...(!body.data.resetPassword && body.data.isActive === false
            ? { tokenVersion: { increment: 1 } }
            : {}),
        },
        select: {
          employeeId: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          lastLoginAt: true,
          lockedUntil: true,
          createdAt: true,
        },
      });

      await logActivity({
        actorEmail: request.currentUser.email,
        action: "user.updated",
        details: {
          email: user.email,
          isActive: user.isActive,
          role: user.role,
          passwordReset: Boolean(body.data.resetPassword),
        },
      });

      const { employeeId: updatedEmployeeId, ...publicUser } = user;
      return { user: { id: String(updatedEmployeeId), ...publicUser } };
    }
  );
}
