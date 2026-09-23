import { ApprovalState, PartyRole, Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { getGmail } from "./client.js";
import {
  ParsedMessage,
  parseGmailMessage,
  partiesFromParsed,
  summarizeBody,
  isEmailReply,
  extractDecisionFromReply,
} from "./parser.js";
import {
  sendNextApproverEmail,
  sendFinalApprovalEmail,
  sendRejectionEmail,
  sendClarificationEmail,
  sendNotYourTurnEmail,
  sendAlreadyDecidedEmail,
} from "./reply.js";
import { config } from "../../config.js";
import { normalizeEmail } from "../access.js";

const isValidSenderDomain = (senderEmail: string): boolean => {
  return senderEmail.endsWith('@blauplug.com');
};

function quarantineReason(parsed: ParsedMessage): string | null {
  if (!parsed.gmailMessageId || !parsed.threadId) {
    return "Missing Gmail message or thread id";
  }
  if (parsed.isFromMonitorInbox) {
    return "SKIP_MONITOR";
  }
  if (parsed.isAutoReply) {
    return "Auto-reply / out-of-office message";
  }
  if (!parsed.from) {
    return "Missing From address";
  }
  if (!isValidSenderDomain(parsed.from.email)) {
    console.warn(`Blocking email from ${parsed.from.email} - only @blauplug.com senders allowed`);
    return "Invalid sender domain";
  }
  if (parsed.to.length === 0) {
    return "No To recipients — cannot determine an approver";
  }
  if (!parsed.subject.trim() && !parsed.bodyText.trim()) {
    return "Empty subject and body";
  }
  return null;
}

async function quarantine(
  parsed: Partial<ParsedMessage>,
  reason: string,
  extra?: Prisma.InputJsonValue
): Promise<void> {
  if (!parsed.gmailMessageId) return;
  await prisma.unprocessedMail.upsert({
    where: { gmailMessageId: parsed.gmailMessageId },
    create: {
      gmailMessageId: parsed.gmailMessageId,
      threadId: parsed.threadId ?? null,
      subject: parsed.subject ?? null,
      fromAddress: parsed.from?.email ?? null,
      snippet: parsed.snippet ?? parsed.bodyText?.slice(0, 180) ?? null,
      reason,
      payload: extra ?? Prisma.JsonNull,
    },
    update: {
      reason,
      snippet: parsed.snippet ?? undefined,
    },
  });
}

async function markProcessed(parsed: ParsedMessage): Promise<void> {
  await prisma.processedMessage.upsert({
    where: { gmailMessageId: parsed.gmailMessageId },
    create: {
      gmailMessageId: parsed.gmailMessageId,
      messageIdHeader: parsed.messageIdHeader,
      threadId: parsed.threadId,
    },
    update: {},
  });
}

export async function findApprovalByThreadId(threadId: string, approverEmail: string) {
  const normEmail = normalizeEmail(approverEmail);
  const approval = await prisma.approval.findFirst({
    where: {
      OR: [{ gmailThreadId: threadId }, { threadId: threadId }],
      state: ApprovalState.PENDING_APPROVAL,
      parties: {
        some: {
          email: { equals: normEmail, mode: "insensitive" },
          role: PartyRole.APPROVER,
        },
      },
      nextApprover: { equals: normEmail, mode: "insensitive" },
    },
    include: {
      parties: true,
      decisions: { orderBy: { decidedAt: "asc" } },
    },
  });
  return approval;
}

export async function handleApprovedDecision(
  approval: any,
  approverEmail: string,
  threadId: string
): Promise<void> {
  const approvers = approval.parties
    .filter((p: any) => p.role === PartyRole.APPROVER)
    .sort((a: any, b: any) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));

  const currentTurn = approval.decisions.length;
  const isLastApprover = currentTurn === approvers.length - 1;
  const nextApproverObj = isLastApprover ? null : approvers[currentTurn + 1];
  const newState = isLastApprover ? ApprovalState.APPROVED : ApprovalState.PENDING_APPROVAL;

  // 1. Do DB work in transaction
  await prisma.$transaction(async (tx) => {
    await tx.decision.create({
      data: {
        approvalId: approval.id,
        decision: "APPROVED",
        decidedBy: approverEmail,
      },
    });

    await tx.approval.update({
      where: { id: approval.id },
      data: {
        state: newState,
        nextApprover: nextApproverObj ? normalizeEmail(nextApproverObj.email) : null,
        lastActivityAt: new Date(),
      },
    });

    await tx.activityLog.create({
      data: {
        approvalId: approval.id,
        actorEmail: approverEmail,
        action: "approval.approved.via_email",
      },
    });
  });

  console.log(`[EMAIL] Decision created: APPROVED`);
  console.log(`[EMAIL] State updated: ${newState}`);

  // 2. AFTER transaction succeeds, send email
  if (nextApproverObj) {
    console.log(`[EMAIL] Notification sent to: ${nextApproverObj.email}`);
    await sendNextApproverEmail(approval, nextApproverObj.email, threadId);
  } else {
    console.log(`[EMAIL] Notification sent to: REQUESTER (Final Approved)`);
    await sendFinalApprovalEmail(approval, threadId);
  }
}

export async function handleRejectedDecision(
  approval: any,
  approverEmail: string,
  threadId: string,
  reason: string | null
): Promise<void> {
  // 1. Do DB work in transaction
  await prisma.$transaction(async (tx) => {
    await tx.decision.create({
      data: {
        approvalId: approval.id,
        decision: "REJECTED",
        reason: reason || "Rejected via email reply",
        decidedBy: approverEmail,
      },
    });

    await tx.approval.update({
      where: { id: approval.id },
      data: {
        state: ApprovalState.REJECTED,
        nextApprover: null,
        lastActivityAt: new Date(),
      },
    });

    await tx.activityLog.create({
      data: {
        approvalId: approval.id,
        actorEmail: approverEmail,
        action: "approval.rejected.via_email",
        details: { reason },
      },
    });
  });

  console.log(`[EMAIL] Decision created: REJECTED`);
  console.log(`[EMAIL] State updated: REJECTED`);

  // 2. AFTER transaction succeeds, send email
  console.log(`[EMAIL] Notification sent to: REQUESTER (Rejected)`);
  await sendRejectionEmail(approval, approverEmail, threadId, reason);
}

export async function handleApprovalReply(parsed: ParsedMessage): Promise<void> {
  const threadId = parsed.threadId;
  const approverEmail = parsed.from?.email || "";
  const normEmail = normalizeEmail(approverEmail);

  console.log(`[EMAIL] Processing reply to thread: ${threadId}`);
  console.log(`[EMAIL] From: ${approverEmail}`);

  try {
    // 1. Check duplicate message
    const existingProcessed = await prisma.processedMessage.findUnique({
      where: { gmailMessageId: parsed.gmailMessageId },
    });
    if (existingProcessed) {
      console.log(`[EMAIL] Duplicate message skipped: ${parsed.gmailMessageId}`);
      return;
    }

    // 2. Email domain validation
    if (!isValidSenderDomain(approverEmail)) {
      console.warn(`[EMAIL] Reply from non-company email: ${approverEmail}`);
      await sendClarificationEmail(threadId, approverEmail);
      return;
    }

    // 3. Extract decision
    const { decision, confidence, reason } = extractDecisionFromReply(parsed.bodyText);
    console.log(`[EMAIL] Decision extracted: ${decision} (confidence: ${confidence})`);

    if (!decision || confidence < 0.6) {
      console.warn(`[EMAIL] Decision unclear for thread ${threadId}`);
      await sendClarificationEmail(threadId, approverEmail);
      return;
    }

    // 4. Find approval
    const approval = await findApprovalByThreadId(threadId, normEmail);
    console.log(`[EMAIL] Approval found: ${approval?.id || "NOT FOUND"}`);

    if (!approval) {
      const existingThread = await prisma.approval.findFirst({
        where: { OR: [{ gmailThreadId: threadId }, { threadId: threadId }] },
        include: { parties: true },
      });

      if (existingThread && existingThread.state !== ApprovalState.PENDING_APPROVAL) {
        await sendAlreadyDecidedEmail(threadId, approverEmail, existingThread.state);
        return;
      }

      if (existingThread && existingThread.nextApprover && existingThread.nextApprover.toLowerCase() !== normEmail.toLowerCase()) {
        console.warn(`[EMAIL] Validation: ${normEmail} == ${existingThread.nextApprover}?`);
        await sendNotYourTurnEmail(threadId, approverEmail, existingThread.nextApprover);
        return;
      }

      console.warn(`[EMAIL] No approval found matching thread ${threadId} and approver ${approverEmail}`);
      await sendAlreadyDecidedEmail(threadId, approverEmail, "FINALIZED / NOT APPLICABLE");
      return;
    }

    // 5. Validation check against nextApprover
    console.log(`[EMAIL] Validation: ${normEmail} == ${approval.nextApprover}?`);
    if (normEmail.toLowerCase() !== (approval.nextApprover || "").toLowerCase()) {
      console.warn(`[EMAIL] Out of turn reply from ${approverEmail}`);
      await sendNotYourTurnEmail(threadId, approverEmail, approval.nextApprover || "another approver");
      return;
    }

    // 6. Execute decision
    if (decision === "APPROVED") {
      await handleApprovedDecision(approval, normEmail, threadId);
    } else if (decision === "REJECTED") {
      await handleRejectedDecision(approval, normEmail, threadId, reason);
    }

    // 7. Mark Processed
    await prisma.processedMessage.upsert({
      where: { gmailMessageId: parsed.gmailMessageId },
      create: {
        gmailMessageId: parsed.gmailMessageId,
        messageIdHeader: parsed.messageIdHeader,
        threadId: parsed.threadId,
      },
      update: {},
    });
    console.log(`[EMAIL] ProcessedMessage recorded for ${parsed.gmailMessageId}`);

  } catch (error) {
    console.error(`[EMAIL REPLY] Error processing approval reply:`, error);

    await prisma.activityLog.create({
      data: {
        approvalId: "unknown",
        actorEmail: approverEmail || "system",
        action: "email.reply.error",
        details: { error: error instanceof Error ? error.message : String(error) },
      },
    }).catch(() => {});

    try {
      await sendClarificationEmail(threadId, approverEmail);
    } catch {}
  }
}

export async function ingestParsedMessage(
  parsed: ParsedMessage,
  actor = config.gmail.user
): Promise<{ kind: "created" | "updated" | "skipped" | "quarantined"; id?: string }> {
  const existingProcessed = await prisma.processedMessage.findUnique({
    where: { gmailMessageId: parsed.gmailMessageId },
  });
  if (existingProcessed) {
    return { kind: "skipped" };
  }

  const reason = quarantineReason(parsed);
  if (reason === "SKIP_MONITOR") {
    await markProcessed(parsed);
    return { kind: "skipped" };
  }
  if (reason) {
    await quarantine(parsed, reason);
    await markProcessed(parsed);
    return { kind: "quarantined" };
  }

  let parties;
  try {
    parties = partiesFromParsed(parsed);
  } catch (err) {
    await quarantine(parsed, err instanceof Error ? err.message : "Parse error");
    await markProcessed(parsed);
    return { kind: "quarantined" };
  }

  const existing = await prisma.approval.findUnique({
    where: { threadId: parsed.threadId },
  });

  if (existing) {
    const createdAt = parsed.date;
    await prisma.approval.update({
      where: { id: existing.id },
      data: {
        lastActivityAt: createdAt > existing.lastActivityAt ? createdAt : existing.lastActivityAt,
        department: existing.department ?? parsed.department,
        project: existing.project ?? parsed.project,
      },
    });
    await markProcessed(parsed);
    return { kind: "updated", id: existing.id };
  }

  const approval = await prisma.$transaction(async (tx) => {
    const created = await tx.approval.create({
      data: {
        subject: parsed.subject,
        body: parsed.bodyText,
        summary: summarizeBody(parsed.bodyText),
        department: parsed.department,
        project: parsed.project,
        state: ApprovalState.REGISTERED,
        threadId: parsed.threadId,
        messageId: parsed.messageIdHeader,
        gmailMessageId: parsed.gmailMessageId,
        lastActivityAt: parsed.date,
        createdAt: parsed.date,
        parties: {
          create: [
            {
              email: normalizeEmail(parties.requester.email),
              name: parties.requester.name,
              role: PartyRole.REQUESTER,
            },
            ...parties.approvers.map((a, index) => ({
              email: normalizeEmail(a.email),
              name: a.name,
              role: PartyRole.APPROVER,
              sequenceOrder: index,
            })),
            ...parties.participants.map((a) => ({
              email: normalizeEmail(a.email),
              name: a.name,
              role: PartyRole.PARTICIPANT,
            })),
          ],
        },
      },
    });

    const pending = await tx.approval.update({
      where: { id: created.id },
      data: {
        state: ApprovalState.PENDING_APPROVAL,
        nextApprover: parties.approvers[0] ? normalizeEmail(parties.approvers[0].email) : null,
        gmailThreadId: parsed.threadId,
        lastActivityAt: new Date(),
      },
    });

    await tx.processedMessage.create({
      data: {
        gmailMessageId: parsed.gmailMessageId,
        messageIdHeader: parsed.messageIdHeader,
        threadId: parsed.threadId,
      },
    });

    return pending;
  });

  return { kind: "created", id: approval.id };
}

export async function fetchAndIngestMessage(gmailMessageId: string) {
  const gmail = getGmail();
  const res = await gmail.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "full",
  });
  const parsed = parseGmailMessage(res.data);
  if (isEmailReply(parsed)) {
    await handleApprovalReply(parsed);
    return { kind: "updated" as const };
  }
  return ingestParsedMessage(parsed);
}

export async function processHistory(startHistoryId: string): Promise<{
  ingested: number;
  skipped: number;
  quarantined: number;
  newHistoryId: string | null;
}> {
  const gmail = getGmail();
  let pageToken: string | undefined;
  const messageIds = new Set<string>();
  let latestHistoryId: string | null = startHistoryId;

  do {
    const res = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      pageToken,
      historyTypes: ["messageAdded"],
    });
    for (const h of res.data.history ?? []) {
      if (h.id) latestHistoryId = String(h.id);
      for (const added of h.messagesAdded ?? []) {
        if (added.message?.id) messageIds.add(added.message.id);
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
    if (res.data.historyId) latestHistoryId = String(res.data.historyId);
  } while (pageToken);

  let ingested = 0;
  let skipped = 0;
  let quarantined = 0;
  for (const id of messageIds) {
    try {
      const result = await fetchAndIngestMessage(id);
      if (result.kind === "created" || result.kind === "updated") ingested += 1;
      else if (result.kind === "quarantined") quarantined += 1;
      else skipped += 1;
    } catch (err) {
      await quarantine(
        { gmailMessageId: id, threadId: "", subject: null as unknown as string },
        err instanceof Error ? err.message : "Ingestion error"
      );
      quarantined += 1;
    }
  }

  await prisma.gmailSyncState.upsert({
    where: { id: "default" },
    create: { id: "default", historyId: latestHistoryId },
    update: { historyId: latestHistoryId ?? undefined, lastReconcileAt: new Date() },
  });

  return { ingested, skipped, quarantined, newHistoryId: latestHistoryId };
}

export async function reconcileRecent(maxResults = 50): Promise<{
  ingested: number;
  skipped: number;
  quarantined: number;
}> {
  const gmail = getGmail();
  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    labelIds: ["INBOX"],
  });
  let ingested = 0;
  let skipped = 0;
  let quarantined = 0;
  for (const msg of list.data.messages ?? []) {
    if (!msg.id) continue;
    try {
      const result = await fetchAndIngestMessage(msg.id);
      if (result.kind === "created" || result.kind === "updated") ingested += 1;
      else if (result.kind === "quarantined") quarantined += 1;
      else skipped += 1;
    } catch (err) {
      await quarantine(
        { gmailMessageId: msg.id, threadId: msg.threadId ?? "" },
        err instanceof Error ? err.message : "Ingestion error"
      );
      quarantined += 1;
    }
  }

  if (list.data.resultSizeEstimate && list.data.messages?.[0]?.id) {
    try {
      const newest = await gmail.users.messages.get({
        userId: "me",
        id: list.data.messages[0].id,
        format: "metadata",
        metadataHeaders: ["Subject"],
      });
      if (newest.data.historyId) {
        await prisma.gmailSyncState.upsert({
          where: { id: "default" },
          create: {
            id: "default",
            historyId: String(newest.data.historyId),
            lastReconcileAt: new Date(),
          },
          update: {
            lastReconcileAt: new Date(),
          },
        });
      }
    } catch {
      // best-effort history cursor
    }
  }

  await prisma.gmailSyncState.upsert({
    where: { id: "default" },
    create: { id: "default", lastReconcileAt: new Date() },
    update: { lastReconcileAt: new Date() },
  });

  return { ingested, skipped, quarantined };
}

export async function handlePushNotification(historyId: string): Promise<void> {
  const state = await prisma.gmailSyncState.findUnique({
    where: { id: "default" },
  });
  const start = state?.historyId;
  if (!start) {
    await reconcileRecent(30);
    await prisma.gmailSyncState.upsert({
      where: { id: "default" },
      create: { id: "default", historyId },
      update: { historyId },
    });
    return;
  }
  try {
    await processHistory(start);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/historyId/.test(message) || /notFound/i.test(message)) {
      await reconcileRecent(50);
      return;
    }
    throw err;
  }
}
