import { gmail_v1 } from "googleapis";
import { getGmail, GMAIL_USER } from "./client.js";

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
