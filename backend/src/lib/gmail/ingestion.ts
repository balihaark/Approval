import { ApprovalState, PartyRole, Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { getGmail } from "./client.js";
import {
  ParsedMessage,
  parseGmailMessage,
  partiesFromParsed,
  summarizeBody,
} from "./parser.js";
import { config } from "../../config.js";
import { normalizeEmail } from "../access.js";

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
      data: { state: ApprovalState.PENDING_APPROVAL, lastActivityAt: new Date() },
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
