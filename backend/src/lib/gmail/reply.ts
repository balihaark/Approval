import { gmail_v1 } from "googleapis";
import { getGmail, GMAIL_USER } from "./client.js";
import { prisma } from "../prisma.js";

export async function getApprovalChain(approvalId: string): Promise<string> {
  const decisions = await prisma.decision.findMany({
    where: { approvalId, decision: "APPROVED" },
    orderBy: { decidedAt: "asc" },
    select: { decidedBy: true },
  });
  return decisions.map((d) => d.decidedBy).join(", ");
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
}

function encodeRfc822(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendThreadReply(input: {
  threadId: string;
  inReplyTo: string | null;
  references: string | null;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
}): Promise<gmail_v1.Schema$Message> {
  const gmail = getGmail();
  const subject = input.subject.toLowerCase().startsWith("re:")
    ? input.subject
    : `Re: ${input.subject}`;

  const headers = [
    `From: ${GMAIL_USER}`,
    `To: ${input.to.join(", ")}`,
    input.cc.length ? `Cc: ${input.cc.join(", ")}` : null,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
    input.references || input.inReplyTo
      ? `References: ${[input.references, input.inReplyTo].filter(Boolean).join(" ")}`
      : null,
  ].filter(Boolean);

  const raw = `${headers.join("\r\n")}\r\n\r\n${input.body}\r\n`;
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: input.threadId,
      raw: encodeRfc822(raw),
    },
  });
  return res.data;
}

/** Send a new approval-request email (starts a Gmail thread). */
export async function sendNewApprovalEmail(input: {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  replyTo?: string | null;
}): Promise<{
  gmailMessageId: string;
  threadId: string;
  messageIdHeader: string | null;
}> {
  if (!input.to.length) {
    throw new Error("At least one To recipient is required");
  }
  const gmail = getGmail();
  const headers = [
    `From: ${GMAIL_USER}`,
    `To: ${input.to.join(", ")}`,
    input.cc.length ? `Cc: ${input.cc.join(", ")}` : null,
    input.replyTo ? `Reply-To: ${input.replyTo}` : null,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ].filter(Boolean);

  const raw = `${headers.join("\r\n")}\r\n\r\n${input.body}\r\n`;
  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodeRfc822(raw) },
  });

  const gmailMessageId = sent.data.id;
  const threadId = sent.data.threadId;
  if (!gmailMessageId || !threadId) {
    throw new Error("Gmail send did not return message/thread id");
  }

  const full = await gmail.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "metadata",
    metadataHeaders: ["Message-ID", "Message-Id"],
  });
  const hdrs = full.data.payload?.headers ?? [];
  const messageIdHeader =
    hdrs.find((h) => (h.name ?? "").toLowerCase() === "message-id")?.value ??
    null;

  return { gmailMessageId, threadId, messageIdHeader };
}

export async function sendApprovalEmail(
  approval: { id: string; subject: string; body: string },
  toEmail: string
): Promise<{ threadId: string; id: string }> {
  const sentMessage = await sendNewApprovalEmail({
    to: [toEmail],
    cc: [],
    subject: `[APPROVAL] ${approval.subject}`,
    body: approval.body,
  });

  // Save threadId immediately to match replies later!
  await prisma.approval.update({
    where: { id: approval.id },
    data: { gmailThreadId: sentMessage.threadId }
  });

  return {
    threadId: sentMessage.threadId,
    id: sentMessage.gmailMessageId,
  };
}

export async function sendNextApproverEmail(
  approval: { id: string; subject: string; messageId?: string | null },
  nextEmail: string,
  threadId: string
): Promise<void> {
  await sendThreadReply({
    threadId: threadId,
    inReplyTo: approval.messageId ?? null,
    references: approval.messageId ?? null,
    to: [nextEmail],
    cc: [],
    subject: `Re: [APPROVAL] ${approval.subject}`,
    body: `Your approval is required for: ${approval.subject}\n\nPlease reply with 'APPROVED' or 'REJECTED'.`,
  });
}

export async function sendFinalApprovalEmail(
  approval: { id: string; subject: string; messageId?: string | null; parties?: Array<{ email: string; role: string }> },
  threadId: string
): Promise<void> {
  const requester = approval.parties?.find((p) => p.role === "REQUESTER");
  const others = approval.parties?.filter((p) => p.role !== "REQUESTER").map((p) => p.email) ?? [];
  const approvalChain = await getApprovalChain(approval.id);

  await sendThreadReply({
    threadId: threadId,
    inReplyTo: approval.messageId ?? null,
    references: approval.messageId ?? null,
    to: requester ? [requester.email] : others.slice(0, 1),
    cc: others,
    subject: approval.subject,
    body: `This approval request has been APPROVED.\n\nApproved by: ${approvalChain}\n\nSubject: ${approval.subject}`,
  });
}

export async function sendRejectionEmail(
  approval: { id: string; subject: string; messageId?: string | null; parties?: Array<{ email: string; role: string }> },
  rejectorEmail: string,
  threadId: string,
  reason?: string | null
): Promise<void> {
  const requester = approval.parties?.find((p) => p.role === "REQUESTER");
  const others = approval.parties?.filter((p) => p.role !== "REQUESTER").map((p) => p.email) ?? [];
  const reasonLine = reason ? `\n\nReason: ${reason}` : "";

  await sendThreadReply({
    threadId: threadId,
    inReplyTo: approval.messageId ?? null,
    references: approval.messageId ?? null,
    to: requester ? [requester.email] : others.slice(0, 1),
    cc: others,
    subject: approval.subject,
    body: `This approval request has been REJECTED by ${rejectorEmail}.${reasonLine}\n\nSubject: ${approval.subject}`,
  });
}

export async function sendClarificationEmail(
  threadId: string,
  approverEmail: string
): Promise<void> {
  await sendThreadReply({
    threadId: threadId,
    inReplyTo: null,
    references: null,
    to: [approverEmail],
    cc: [],
    subject: "Clarification Needed - Approval Decision",
    body: "We could not clear your decision from your reply. Please reply with 'APPROVED' or 'REJECTED' (optional: 'APPROVED: your reason').",
  });
}

export async function sendNotYourTurnEmail(
  threadId: string,
  approverEmail: string,
  expectedApprover: string
): Promise<void> {
  await sendThreadReply({
    threadId: threadId,
    inReplyTo: null,
    references: null,
    to: [approverEmail],
    cc: [],
    subject: "Action Not Required Yet - Out of Turn",
    body: `It is not your turn to decide on this approval yet. Currently waiting on ${expectedApprover} to act first.`,
  });
}

export async function sendAlreadyDecidedEmail(
  threadId: string,
  approverEmail: string,
  currentState: string
): Promise<void> {
  await sendThreadReply({
    threadId: threadId,
    inReplyTo: null,
    references: null,
    to: [approverEmail],
    cc: [],
    subject: "Approval Already Finalized",
    body: `This approval request has already been finalized (Status: ${currentState}). No further replies are accepted.`,
  });
}

