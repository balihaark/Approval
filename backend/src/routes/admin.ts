import { FastifyInstance } from "fastify";
import { z } from "zod";
import { UserRole } from "@prisma/client";
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

const simulateSchema = z.object({
  from: z.string(),
  to: z.array(z.string()).min(1),
  cc: z.array(z.string()).optional(),
  subject: z.string(),
  body: z.string(),
  department: z.string().optional(),
  project: z.string().optional(),
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
    const items = await prisma.employee.findMany({ orderBy: { createdAt: "desc" } });
    return {
      items: items.map((e) => ({
        id: String(e.employeeId),
        email: e.email,
        name: e.name,
        role: e.role,
        isActive: e.isActive,
        mustChangePassword: false,
        lastLoginAt: e.lastLoginAt?.toISOString() ?? null,
        lockedUntil: null,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });

  app.post("/admin/users", { preHandler: requireAdmin }, async (request, reply) => {
    const body = request.body as { email?: string; name?: string; role?: "USER" | "ADMIN" };
    if (!body.email || !body.name) return reply.badRequest("Email and name are required");
    const email = body.email.trim().toLowerCase();
    const existing = await prisma.employee.findUnique({ where: { email } });
    if (existing) return reply.badRequest("Employee with this email already exists");

    const maxEmp = await prisma.employee.findFirst({ orderBy: { employeeId: "desc" } });
    const nextId = (maxEmp?.employeeId ?? 1000) + 1;
    const employee = await prisma.employee.create({
      data: {
        employeeId: nextId,
        email,
        name: body.name.trim(),
        role: body.role === "ADMIN" ? UserRole.ADMIN : UserRole.USER,
        isActive: true,
      },
    });

    return {
      id: String(employee.employeeId),
      email: employee.email,
      name: employee.name,
      role: employee.role,
      isActive: employee.isActive,
      mustChangePassword: false,
      lastLoginAt: null,
      lockedUntil: null,
      createdAt: employee.createdAt.toISOString(),
    };
  });

  app.patch("/admin/users/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const empId = parseInt(id, 10);
    const body = request.body as { isActive?: boolean; role?: "USER" | "ADMIN"; name?: string };

    const employee = await prisma.employee.update({
      where: { employeeId: empId },
      data: {
        isActive: body.isActive !== undefined ? body.isActive : undefined,
        role: body.role ? (body.role === "ADMIN" ? UserRole.ADMIN : UserRole.USER) : undefined,
        name: body.name ? body.name.trim() : undefined,
      },
    });

    return {
      id: String(employee.employeeId),
      email: employee.email,
      name: employee.name,
      role: employee.role,
      isActive: employee.isActive,
      mustChangePassword: false,
      lastLoginAt: employee.lastLoginAt?.toISOString() ?? null,
      lockedUntil: null,
      createdAt: employee.createdAt.toISOString(),
    };
  });
}
