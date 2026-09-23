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

  // Read-only listing of employees who have signed in via SSO. Deactivation
  // and identity edits happen in central's HR dashboard; ADMIN/USER role is
  // set by a dev running SQL directly on the approvals DB
  // (see decision_approvals_admin_manual). No write endpoints here.
  app.get("/admin/users", { preHandler: requireAdmin }, async () => {
    const users = await prisma.employee.findMany({
      orderBy: { email: "asc" },
      select: {
        employeeId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return {
      items: users.map((user) => ({
        id: user.employeeId,
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email.split("@")[0],
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      })),
    };
  });
}
