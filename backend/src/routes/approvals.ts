import { FastifyInstance } from "fastify";
import { ApprovalState, PartyRole, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../plugins/auth.js";
import { userCanAccessApproval, normalizeEmail } from "../lib/access.js";
import { gmailConfigured, config } from "../config.js";
import { sendThreadReply, sendNewApprovalEmail, getApprovalChain } from "../lib/gmail/reply.js";

const isValidBlauplugEmail = (email: string): boolean => {
  return email.trim().toLowerCase().endsWith("@blauplug.com");
};

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
  REVOKED: "Revoked",
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
  const approvers = approval.parties
    .filter((p) => p.role === "APPROVER")
    .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
  const participants = approval.parties.filter((p) => p.role === "PARTICIPANT");
  const sortedParties = [...approval.parties].sort((a, b) => {
    if (a.role === "APPROVER" && b.role === "APPROVER") {
      return (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0);
    }
    return 0;
  });

  const approvedBy = approval.decisions
    .filter((d) => d.decision === "APPROVED")
    .sort((a, b) => new Date(a.decidedAt).getTime() - new Date(b.decidedAt).getTime())
    .map((d) => d.decidedBy)
    .join(", ");

  return {
    id: approval.id,
    subject: approval.subject,
    body: approval.body,
    summary: approval.summary,
    department: approval.department,
    project: approval.project,
    state: approval.state,
    stateLabel: STATE_LABEL[approval.state],
    approvedBy: approvedBy || undefined,
    revokedAt: approval.revokedAt,
    revokedBy: approval.revokedBy,
    revokeReason: approval.revokeReason,
    threadId: approval.threadId,
    createdAt: approval.createdAt,
    lastActivityAt: approval.lastActivityAt,
    requester: requester
      ? { email: requester.email, name: requester.name }
      : null,
    approvers: approvers.map((p) => ({
      email: p.email,
      name: p.name,
      sequenceOrder: p.sequenceOrder,
    })),
    participants: participants.map((p) => ({
      email: p.email,
      name: p.name,
    })),
    parties: sortedParties.map((p) => ({
      email: p.email,
      name: p.name,
      role: p.role,
      sequenceOrder: p.sequenceOrder,
    })),
    decisions: approval.decisions
      .slice()
      .sort((a, b) => new Date(a.decidedAt).getTime() - new Date(b.decidedAt).getTime())
      .map((d) => ({
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

      for (const email of [...parsed.data.approvers, ...(parsed.data.participants ?? [])]) {
        if (!isValidBlauplugEmail(email)) {
          return reply.badRequest("Party email must be @blauplug.com domain");
        }
      }

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
            nextApprover: approvers[0] ? normalizeEmail(approvers[0]) : null,
            threadId: sent.threadId,
            gmailThreadId: sent.threadId,
            messageId: sent.messageIdHeader,
            gmailMessageId: sent.gmailMessageId,
            parties: {
              create: [
                {
                  email: normalizeEmail(user.email),
                  name: user.name,
                  role: PartyRole.REQUESTER,
                },
                ...approvers.map((email, index) => ({
                  email,
                  name: null as string | null,
                  role: PartyRole.APPROVER,
                  sequenceOrder: index,
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

        await tx.processedMessage.upsert({
          where: { gmailMessageId: sent.gmailMessageId },
          create: {
            gmailMessageId: sent.gmailMessageId,
            messageIdHeader: sent.messageIdHeader,
            threadId: sent.threadId,
          },
          update: {},
        });

        await tx.activityLog.create({
          data: {
            approvalId: created.id,
            actorEmail: user.email,
            action: "approval.created.in_app",
            details: { subject: created.subject },
          },
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
      const approval = await prisma.approval.findUnique({
        where: { id },
        include: {
          parties: true,
          decisions: { orderBy: { decidedAt: "asc" } },
        },
      });
      if (!approval) return reply.notFound("Approval not found");

      const requester = approval.parties.find((p) => p.role === "REQUESTER");
      const approversCount = approval.parties.filter((p) => p.role === "APPROVER").length;
      const items = [
        {
          id: `act-created-${approval.id}`,
          actorEmail: requester?.email ?? "system",
          action: "approval.created.in_app",
          details: null,
          createdAt: approval.createdAt.toISOString(),
        },
        ...approval.decisions.map((d, idx) => ({
          id: d.id,
          actorEmail: d.decidedBy,
          action: d.decision === "APPROVED" ? "approval.approved" : "approval.rejected",
          details: { isLastApprover: idx === approversCount - 1, reason: d.reason },
          createdAt: d.decidedAt.toISOString(),
        })),
      ];

      return { items };
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
        include: {
          parties: true,
          decisions: { orderBy: { decidedAt: "asc" } },
        },
      });
      if (!approval) return reply.notFound("Approval not found");

      if (
        approval.state === ApprovalState.APPROVED ||
        approval.state === ApprovalState.REJECTED
      ) {
        return reply.conflict("This approval has already been decided");
      }

      const approvers = approval.parties
        .filter((p) => p.role === PartyRole.APPROVER)
        .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));

      const decisions = approval.decisions;
      const turnIndex = decisions.length;

      if (turnIndex >= approvers.length) {
        return reply.conflict("This approval has already been decided");
      }

      const currentApprover = approvers[turnIndex];
      const user = request.currentUser;

      const isCurrentTurnApprover =
        user.email.toLowerCase() === currentApprover.email.toLowerCase();
      const isAdminOverride = !isCurrentTurnApprover && user.role === "ADMIN";

      if (!isCurrentTurnApprover && !isAdminOverride) {
        const currentDisplayName = currentApprover.name || currentApprover.email;
        return reply.forbidden(
          `It is not your turn to decide on this approval yet — waiting on ${currentDisplayName} to act first.`
        );
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
      const isLastApprover = turnIndex === approvers.length - 1;
      const nextState =
        outcome === "REJECTED"
          ? ApprovalState.REJECTED
          : isLastApprover
          ? ApprovalState.APPROVED
          : ApprovalState.PENDING_APPROVAL;

      const nextApproverEmail =
        outcome === "REJECTED" || isLastApprover
          ? null
          : normalizeEmail(approvers[turnIndex + 1].email);

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
          data: {
            state: nextState,
            nextApprover: nextApproverEmail,
            lastActivityAt: new Date(),
          },
          include: { parties: true, decisions: { orderBy: { decidedAt: "asc" } } },
        });
        return row;
      });

      let emailError: string | null = null;
      const shouldSendEmail =
        (outcome === "REJECTED" || isLastApprover) &&
        gmailConfigured() &&
        !approval.threadId.startsWith("local-");

      if (shouldSendEmail) {
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
          const approvalChain = await getApprovalChain(updated.id);
          const bodyText =
            outcome === "APPROVED"
              ? `This approval request has been APPROVED.\n\nApproved by: ${approvalChain}\n\nSubject: ${approval.subject}\n\nThis decision was recorded in the Approvals App. Please do not reply to this message to change the decision.`
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
        } catch (err) {
          emailError = err instanceof Error ? err.message : "Failed to send email";
        }
      }

      return {
        approval: serializeApproval(updated),
        emailError,
      };
    }
  );

  app.post(
    "/approvals/:id/revoke",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z.object({ reason: z.string().min(1, "Reason is required") }).safeParse(request.body);
      if (!body.success) {
        return reply.badRequest("A valid revocation reason is required");
      }

      const approval = await prisma.approval.findUnique({
        where: { id },
        include: { parties: true, decisions: true },
      });

      if (!approval) {
        return reply.notFound("Approval not found");
      }

      const user = request.currentUser;
      const canAccess = await userCanAccessApproval(user, id);
      if (!canAccess) {
        return reply.forbidden("You do not have permission to access this approval");
      }

      if (approval.state !== ApprovalState.APPROVED && approval.state !== ApprovalState.PENDING_APPROVAL) {
        return reply.badRequest("Only pending or approved requests can be revoked");
      }

      const requester = approval.parties.find((p) => p.role === "REQUESTER");
      const isRequester = requester && requester.email.toLowerCase() === user.email.toLowerCase();
      const isAdmin = user.role === "ADMIN";

      if (!isRequester && !isAdmin) {
        return reply.forbidden("Only the requester or an admin can revoke an approval");
      }

      const reasonStr = body.data.reason.trim();
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.approval.update({
          where: { id },
          data: {
            state: ApprovalState.REVOKED,
            revokedAt: new Date(),
            revokedBy: user.email,
            revokeReason: reasonStr,
            lastActivityAt: new Date(),
          },
          include: { parties: true, decisions: { orderBy: { decidedAt: "asc" } } },
        });

        await tx.activityLog.create({
          data: {
            approvalId: id,
            actorEmail: user.email,
            action: "approval.revoked",
            details: { reason: reasonStr },
          },
        });

        return row;
      });

      let emailError: string | null = null;
      if (gmailConfigured() && !approval.threadId.startsWith("local-")) {
        try {
          const allParties = approval.parties.map((p) => p.email);
          const toEmails: string[] = requester ? [requester.email] : allParties.slice(0, 1);
          const ccEmails: string[] = allParties.filter((e) => e !== (requester?.email ?? ""));
          const bodyText = `This approval request has been REVOKED by ${user.name} <${user.email}>.\n\nReason: ${reasonStr}\n\nSubject: ${approval.subject}\n\nThis decision was updated in the Approvals App.`;
          await sendThreadReply({
            threadId: approval.threadId,
            inReplyTo: approval.messageId,
            references: approval.messageId,
            to: toEmails,
            cc: ccEmails,
            subject: approval.subject,
            body: bodyText,
          });
        } catch (err) {
          emailError = err instanceof Error ? err.message : "Failed to send revocation email";
        }
      }

      return {
        approval: serializeApproval(updated),
        emailError,
      };
    }
  );

  app.post(
    "/approvals/:id/resubmit-after-revoke",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const approval = await prisma.approval.findUnique({
        where: { id },
        include: { parties: true, decisions: true },
      });

      if (!approval) {
        return reply.notFound("Approval not found");
      }

      const user = request.currentUser;
      const canAccess = await userCanAccessApproval(user, id);
      if (!canAccess) {
        return reply.forbidden("You do not have permission to access this approval");
      }

      if (approval.state !== ApprovalState.REVOKED) {
        return reply.badRequest("Only revoked requests can be resubmitted");
      }

      const requester = approval.parties.find((p) => p.role === "REQUESTER");
      const isRequester = requester && requester.email.toLowerCase() === user.email.toLowerCase();

      if (!isRequester) {
        return reply.forbidden("Only the original requester can resubmit a revoked approval");
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.decision.deleteMany({
          where: { approvalId: id },
        });

        const row = await tx.approval.update({
          where: { id },
          data: {
            state: ApprovalState.PENDING_APPROVAL,
            revokedAt: null,
            revokedBy: null,
            revokeReason: null,
            lastActivityAt: new Date(),
          },
          include: { parties: true, decisions: { orderBy: { decidedAt: "asc" } } },
        });

        await tx.activityLog.create({
          data: {
            approvalId: id,
            actorEmail: user.email,
            action: "approval.resubmitted_after_revoke",
            details: {},
          },
        });

        return row;
      });

      let emailError: string | null = null;
      if (gmailConfigured() && !approval.threadId.startsWith("local-")) {
        try {
          const approvers = approval.parties
            .filter((p) => p.role === "APPROVER")
            .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
          const firstApprover = approvers[0];
          const allParties = approval.parties.map((p) => p.email);
          const toEmails: string[] = firstApprover ? [firstApprover.email] : allParties.slice(0, 1);
          const bodyText = `This approval request has been RESUBMITTED for approval by ${user.name} <${user.email}>.\n\nSubject: ${approval.subject}\n\nPlease review and submit your decision in the Approvals App.`;

          await sendThreadReply({
            threadId: approval.threadId,
            inReplyTo: approval.messageId,
            references: approval.messageId,
            to: toEmails,
            cc: allParties,
            subject: approval.subject,
            body: bodyText,
          });
        } catch (err) {
          emailError = err instanceof Error ? err.message : "Failed to send resubmission email";
        }
      }

      return {
        approval: serializeApproval(updated),
        emailError,
      };
    }
  );
}
