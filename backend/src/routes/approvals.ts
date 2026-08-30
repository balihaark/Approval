import { FastifyInstance } from "fastify";
import { ApprovalState, PartyRole, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../plugins/auth.js";
import { userCanAccessApproval, normalizeEmail } from "../lib/access.js";
import { logActivity } from "../lib/audit.js";
import { gmailConfigured, config } from "../config.js";
import { sendThreadReply, sendNewApprovalEmail } from "../lib/gmail/reply.js";

const createSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
  approvers: z.array(z.string().email()).min(1),
  participants: z.array(z.string().email()).optional(),
  department: z.string().max(120).nullable().optional(),
  project: z.string().max(120).nullable().optional(),
});

function summarizeBody(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= 280) return compact;
  return `${compact.slice(0, 277)}...`;
}

const STATE_LABEL: Record<ApprovalState, string> = {
  REGISTERED: "Registered",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const listQuery = z.object({
  view: z.enum(["sent", "received", "part-of", "all"]).optional(),
  state: z.nativeEnum(ApprovalState).optional(),
  department: z.string().optional(),
  project: z.string().optional(),
  q: z.string().optional(),
  participant: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const decideSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().optional(),
});

const patchSchema = z.object({
  department: z.string().nullable().optional(),
  project: z.string().nullable().optional(),
});

function serializeApproval(
  approval: Prisma.ApprovalGetPayload<{
    include: { parties: true; decisions: true };
  }>
) {
  const requester = approval.parties.find((p) => p.role === "REQUESTER");
  return {
    id: approval.id,
    subject: approval.subject,
    body: approval.body,
    summary: approval.summary,
    department: approval.department,
    project: approval.project,
    state: approval.state,
    stateLabel: STATE_LABEL[approval.state],
    threadId: approval.threadId,
    createdAt: approval.createdAt,
    lastActivityAt: approval.lastActivityAt,
    requester: requester
      ? { email: requester.email, name: requester.name }
      : null,
    approvers: approval.parties
      .filter((p) => p.role === "APPROVER")
      .map((p) => ({ email: p.email, name: p.name })),
    participants: approval.parties
      .filter((p) => p.role === "PARTICIPANT")
      .map((p) => ({ email: p.email, name: p.name })),
    parties: approval.parties.map((p) => ({
      email: p.email,
      name: p.name,
      role: p.role,
    })),
    decisions: approval.decisions.map((d) => ({
      id: d.id,
      decision: d.decision,
      reason: d.reason,
      decidedBy: d.decidedBy,
      decidedAt: d.decidedAt,
    })),
  };
}

export async function approvalRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/approvals",
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest(
          "Subject, body, and at least one approver email are required"
        );
      }
      if (!gmailConfigured()) {
        return reply.badRequest(
          "Gmail is not connected. Connect the monitoring inbox before sending requests from the app."
        );
      }

      const user = request.currentUser;
      const monitor = config.gmail.user.toLowerCase();
      const approvers = [
        ...new Set(parsed.data.approvers.map((e) => normalizeEmail(e))),
      ].filter((e) => e !== monitor && e !== normalizeEmail(user.email));
      const participants = [
        ...new Set((parsed.data.participants ?? []).map((e) => normalizeEmail(e))),
      ].filter(
        (e) =>
          e !== monitor &&
          e !== normalizeEmail(user.email) &&
          !approvers.includes(e)
      );

      if (!approvers.length) {
        return reply.badRequest(
          "Add at least one approver email different from yourself and the monitoring inbox"
        );
      }

      const dept = parsed.data.department?.trim() || null;
      const project = parsed.data.project?.trim() || null;
      const subject = parsed.data.subject.trim();
      const bodyText = [
        dept ? `Department: ${dept}` : null,
        project ? `Project: ${project}` : null,
        dept || project ? "" : null,
        parsed.data.body.trim(),
        "",
        "---",
        `Requested in the Approvals App by ${user.name} <${user.email}>.`,
        "Please decide in the Approvals App (Approve / Reject). Do not reply to this email to record a decision.",
      ]
        .filter((line) => line !== null)
        .join("\n");

      let sent;
      try {
        sent = await sendNewApprovalEmail({
          to: approvers,
          cc: [normalizeEmail(user.email), ...participants],
          subject,
          body: bodyText,
          replyTo: user.email,
        });
      } catch (err) {
        return reply.internalServerError(
          err instanceof Error ? err.message : "Failed to send approval email"
        );
      }

      const approval = await prisma.$transaction(async (tx) => {
        const created = await tx.approval.create({
          data: {
            subject,
            body: bodyText,
            summary: summarizeBody(parsed.data.body.trim()),
            department: dept,
            project,
            state: ApprovalState.PENDING_APPROVAL,
            threadId: sent.threadId,
            messageId: sent.messageIdHeader,
            gmailMessageId: sent.gmailMessageId,
            parties: {
              create: [
                {
                  email: normalizeEmail(user.email),
                  name: user.name,
                  role: PartyRole.REQUESTER,
                },
                ...approvers.map((email) => ({
                  email,
                  name: null as string | null,
                  role: PartyRole.APPROVER,
                })),
                ...participants.map((email) => ({
                  email,
                  name: null as string | null,
                  role: PartyRole.PARTICIPANT,
                })),
              ],
            },
          },
          include: { parties: true, decisions: true },
        });

        await tx.activityLog.create({
          data: {
            approvalId: created.id,
            actorEmail: user.email,
            action: "approval.created.in_app",
            details: {
              gmailMessageId: sent.gmailMessageId,
              threadId: sent.threadId,
              approvers,
              participants,
            },
          },
        });

        await tx.processedMessage.upsert({
          where: { gmailMessageId: sent.gmailMessageId },
          create: {
            gmailMessageId: sent.gmailMessageId,
            messageIdHeader: sent.messageIdHeader,
            threadId: sent.threadId,
          },
          update: {},
        });

        return created;
      });

      return {
        approval: serializeApproval(approval),
        emailSent: true,
      };
    }
  );

  app.get(
    "/approvals",
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = listQuery.safeParse(request.query);
      if (!parsed.success) return reply.badRequest("Invalid query");
      const q = parsed.data;
      const page = q.page ?? 1;
      const pageSize = q.pageSize ?? 20;
      const user = request.currentUser;

      const and: Prisma.ApprovalWhereInput[] = [];

      if (user.role !== "ADMIN" || q.view !== "all") {
        const view = q.view ?? "received";
        const emailFilter = {
          email: { equals: user.email, mode: "insensitive" as const },
        };
        if (view === "sent") {
          and.push({
            parties: { some: { ...emailFilter, role: PartyRole.REQUESTER } },
          });
        } else if (view === "received") {
          and.push({
            parties: { some: { ...emailFilter, role: PartyRole.APPROVER } },
          });
        } else if (view === "part-of") {
          and.push({
            parties: { some: { ...emailFilter, role: PartyRole.PARTICIPANT } },
          });
        } else if (user.role !== "ADMIN") {
          and.push({ parties: { some: emailFilter } });
        }
      }

      if (q.state) and.push({ state: q.state });
      if (q.department) {
        and.push({
          department: { contains: q.department, mode: "insensitive" },
        });
      }
      if (q.project) {
        and.push({ project: { contains: q.project, mode: "insensitive" } });
      }
      if (q.participant) {
        and.push({
          parties: {
            some: {
              email: { contains: q.participant, mode: "insensitive" },
            },
          },
        });
      }
      if (q.q) {
        and.push({
          OR: [
            { subject: { contains: q.q, mode: "insensitive" } },
            { body: { contains: q.q, mode: "insensitive" } },
            { department: { contains: q.q, mode: "insensitive" } },
            { project: { contains: q.q, mode: "insensitive" } },
            {
              parties: {
                some: { email: { contains: q.q, mode: "insensitive" } },
              },
            },
          ],
        });
      }
      if (q.from) {
        and.push({ createdAt: { gte: new Date(q.from) } });
      }
      if (q.to) {
        const end = new Date(q.to);
        end.setHours(23, 59, 59, 999);
        and.push({ createdAt: { lte: end } });
      }

      const where: Prisma.ApprovalWhereInput = and.length ? { AND: and } : {};

      const [total, rows] = await Promise.all([
        prisma.approval.count({ where }),
        prisma.approval.findMany({
          where,
          include: { parties: true, decisions: true },
          orderBy: { lastActivityAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      return {
        total,
        page,
        pageSize,
        items: rows.map(serializeApproval),
      };
    }
  );

  app.get(
    "/approvals/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await userCanAccessApproval(request.currentUser, id))) {
        return reply.forbidden("You are not a party to this approval");
      }
      const approval = await prisma.approval.findUnique({
        where: { id },
        include: {
          parties: true,
          decisions: { orderBy: { decidedAt: "desc" } },
        },
      });
      if (!approval) return reply.notFound("Approval not found");
      return serializeApproval(approval);
    }
  );

  app.get(
    "/approvals/:id/activity",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await userCanAccessApproval(request.currentUser, id))) {
        return reply.forbidden("You are not a party to this approval");
      }
      const logs = await prisma.activityLog.findMany({
        where: { approvalId: id },
        orderBy: { createdAt: "asc" },
      });
      return { items: logs };
    }
  );

  app.patch(
    "/approvals/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await userCanAccessApproval(request.currentUser, id))) {
        return reply.forbidden("You are not a party to this approval");
      }
      const body = patchSchema.safeParse(request.body);
      if (!body.success) return reply.badRequest("Invalid payload");
      const updated = await prisma.approval.update({
        where: { id },
        data: {
          department: body.data.department,
          project: body.data.project,
          lastActivityAt: new Date(),
        },
        include: { parties: true, decisions: true },
      });
      await logActivity({
        approvalId: id,
        actorEmail: request.currentUser.email,
        action: "approval.metadata.updated",
        details: body.data,
      });
      return serializeApproval(updated);
    }
  );

  app.post(
    "/approvals/:id/decide",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = decideSchema.safeParse(request.body);
      if (!body.success) return reply.badRequest("Invalid payload");

      const approval = await prisma.approval.findUnique({
        where: { id },
        include: { parties: true, decisions: true },
      });
      if (!approval) return reply.notFound("Approval not found");

      const user = request.currentUser;
      const isApprover = approval.parties.some(
        (p) =>
          p.role === PartyRole.APPROVER &&
          p.email.toLowerCase() === user.email.toLowerCase()
      );
      const isAdminOverride = !isApprover && user.role === "ADMIN";
      if (!isApprover && !isAdminOverride) {
        return reply.forbidden("Only assigned approvers can decide");
      }

      if (
        approval.state === ApprovalState.APPROVED ||
        approval.state === ApprovalState.REJECTED
      ) {
        return reply.conflict("This approval has already been decided");
      }

      if (body.data.decision === "rejected") {
        const reason = body.data.reason?.trim() ?? "";
        if (!reason) {
          return reply.badRequest("A reason is required when rejecting");
        }
      }

      if (isAdminOverride) {
        const overrideReason = body.data.reason?.trim() ?? "";
        if (!overrideReason) {
          return reply.badRequest(
            "Admins must provide a reason when deciding on behalf of an approver"
          );
        }
      }

      const outcome =
        body.data.decision === "approved" ? "APPROVED" : "REJECTED";
      const nextState =
        outcome === "APPROVED"
          ? ApprovalState.APPROVED
          : ApprovalState.REJECTED;

      const updated = await prisma.$transaction(async (tx) => {
        await tx.decision.create({
          data: {
            approvalId: id,
            decision: outcome,
            reason:
              body.data.decision === "rejected"
                ? body.data.reason!.trim()
                : body.data.reason?.trim() || null,
            decidedBy: user.email,
          },
        });
        const row = await tx.approval.update({
          where: { id },
          data: { state: nextState, lastActivityAt: new Date() },
          include: { parties: true, decisions: true },
        });
        await tx.activityLog.create({
          data: {
            approvalId: id,
            actorEmail: user.email,
            action:
              outcome === "APPROVED"
                ? "approval.approved"
                : "approval.rejected",
            details: {
              reason:
                body.data.decision === "rejected" || isAdminOverride
                  ? body.data.reason!.trim()
                  : null,
              adminOverride: isAdminOverride,
            },
          },
        });
        return row;
      });

      let emailError: string | null = null;
      if (gmailConfigured() && !approval.threadId.startsWith("local-")) {
        try {
          const requester = approval.parties.find(
            (p) => p.role === "REQUESTER"
          );
          const others = approval.parties
            .filter((p) => p.role !== "REQUESTER")
            .map((p) => p.email);
          const reasonLine =
            outcome === "REJECTED"
              ? `\n\nReason: ${body.data.reason!.trim()}`
              : "";
          const bodyText =
            outcome === "APPROVED"
              ? `This approval request has been APPROVED by ${user.name} <${user.email}>.\n\nSubject: ${approval.subject}\n\nThis decision was recorded in the Approvals App. Please do not reply to this message to change the decision.`
              : `This approval request has been REJECTED by ${user.name} <${user.email}>.${reasonLine}\n\nSubject: ${approval.subject}\n\nThis decision was recorded in the Approvals App. Please do not reply to this message to change the decision.`;

          await sendThreadReply({
            threadId: approval.threadId,
            inReplyTo: approval.messageId,
            references: approval.messageId,
            to: requester ? [requester.email] : others.slice(0, 1),
            cc: others,
            subject: approval.subject,
            body: bodyText,
          });
          await logActivity({
            approvalId: id,
            actorEmail: user.email,
            action: "email.decision.sent",
            details: { outcome },
          });
        } catch (err) {
          emailError = err instanceof Error ? err.message : "Failed to send email";
          await logActivity({
            approvalId: id,
            actorEmail: user.email,
            action: "email.decision.failed",
            details: { error: emailError },
          });
        }
      }

      return {
        approval: serializeApproval(updated),
        emailError,
      };
    }
  );
}
