import { config } from "../../config.js";

export type ParsedAddress = {
  email: string;
  name: string | null;
};

export type ParsedMessage = {
  gmailMessageId: string;
  threadId: string;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  references: string | null;
  subject: string;
  from: ParsedAddress | null;
  to: ParsedAddress[];
  cc: ParsedAddress[];
  date: Date;
  bodyText: string;
  snippet: string;
  department: string | null;
  project: string | null;
  isAutoReply: boolean;
  isFromMonitorInbox: boolean;
};

const MONITOR = config.gmail.user.toLowerCase();

function header(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string
): string | null {
  const found = headers?.find(
    (h) => (h.name ?? "").toLowerCase() === name.toLowerCase()
  );
  return found?.value ?? null;
}

function parseAddressList(raw: string | null): ParsedAddress[] {
  if (!raw) return [];
  // Split on commas that are outside angle brackets / quotes
  const parts: string[] = [];
  let current = "";
  let inAngles = false;
  let inQuotes = false;
  for (const ch of raw) {
    if (ch === '"' && !inAngles) inQuotes = !inQuotes;
    else if (ch === "<" && !inQuotes) inAngles = true;
    else if (ch === ">" && !inQuotes) inAngles = false;
    if (ch === "," && !inAngles && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);

  const result: ParsedAddress[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // "Display Name" <email@x.com>  or  Display Name <email@x.com>
    const angled = trimmed.match(/^(?:"([^"]+)"|([^<]*?))?\s*<\s*([^>\s]+@[^>\s]+)\s*>$/);
    if (angled) {
      const email = angled[3].toLowerCase();
      const name = (angled[1] ?? angled[2] ?? "").trim() || null;
      result.push({ email, name });
      continue;
    }

    // Bare email
    const bare = trimmed.match(/^([^\s<>]+@[^\s<>]+)$/);
    if (bare) {
      result.push({ email: bare[1].toLowerCase(), name: null });
    }
  }
  return result;
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

type MimePart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: MimePart[] | null;
};

function collectTextParts(part: MimePart | undefined, acc: string[]): void {
  if (!part) return;
  const mime = (part.mimeType ?? "").toLowerCase();
  if (mime === "text/plain" && part.body?.data) {
    acc.push(decodeBase64Url(part.body.data));
  }
  if (part.parts) {
    for (const child of part.parts) collectTextParts(child, acc);
  }
}

function collectHtmlParts(part: MimePart | undefined, acc: string[]): void {
  if (!part) return;
  const mime = (part.mimeType ?? "").toLowerCase();
  if (mime === "text/html" && part.body?.data) {
    acc.push(decodeBase64Url(part.body.data));
  }
  if (part.parts) {
    for (const child of part.parts) collectHtmlParts(child, acc);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripQuotedHistory(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cutPatterns = [
    /^on .+ wrote:\s*$/i,
    /^-{2,}\s*original message\s*-{2,}$/i,
    /^from:\s.+$/i,
    /^>+/,
    /^_{5,}$/,
  ];
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      /^on .+ wrote:\s*$/i.test(line) ||
      /^-{2,}\s*original message\s*-{2,}$/i.test(line)
    ) {
      break;
    }
    if (cutPatterns[3].test(line) && result.length > 0) {
      break;
    }
    result.push(line);
  }
  return result.join("\n").trim();
}

export function stripSignature(text: string): string {
  if (!text) return "";

  // 1. Remove multiline disclaimer blocks surrounded by 5+ asterisks (e.g. *****Disclaimer...*****)
  let cleaned = text.replace(/\*{5,}[\s\S]*?\*{5,}/g, "").trim();

  // 2. Remove inline image references like [cid:...]
  cleaned = cleaned.replace(/\[cid:[^\]]+\]/gi, "").trim();

  const lines = cleaned.replace(/\r\n/g, "\n").split("\n");

  // Sign-off standalone line patterns (e.g. "Best Regards ,", "Thanks,", "Sent from my iPhone")
  const sigStartRegexes = [
    /^--\s*$/,
    /^(best\s+regards|kind\s+regards|warm\s+regards|regards|thanks|thank\s+you|cheers|yours\s+sincerely|sincerely)\s*[,.]?\s*$/i,
    /^sent\s+from\s+my\b/i,
    /^get\s+outlook\s+for\b/i,
  ];

  // Structural signature line regexes:
  // Line with 1 or 2 pipes: e.g. "Name | Title | Company" or "Name | Title"
  const pipeLineRegex = /^[^|\n]{2,60}\s*\|\s*[^|\n]{2,60}(\s*\|\s*[^|\n]{2,60})?\s*$/;
  // Separator line: e.g. "_________________" or "-----------------"
  const separatorLineRegex = /^(_|-|\*=){3,}\s*$/;
  // Contact line: phone numbers, emails, <mailto:...>
  const contactLineRegex = /(?:\+?\d[\d\s\-\/\(\)\.]{7,}|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|<mailto:[^>]+>)/i;

  let cutIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const lineTrimmed = lines[i].trim();
    if (!lineTrimmed) continue;

    // Check sign-off trigger lines
    if (sigStartRegexes.some((re) => re.test(lineTrimmed))) {
      cutIndex = i;
      break;
    }

    // Structural Check 1: "Name | Title | Company" line followed by separator or contact info
    if (pipeLineRegex.test(lineTrimmed)) {
      const next1 = lines[i + 1]?.trim() ?? "";
      const next2 = lines[i + 2]?.trim() ?? "";
      if (
        separatorLineRegex.test(next1) ||
        contactLineRegex.test(next1) ||
        separatorLineRegex.test(next2) ||
        contactLineRegex.test(next2)
      ) {
        cutIndex = i;
        break;
      }
    }

    // Structural Check 2: Separator line followed by contact info
    if (separatorLineRegex.test(lineTrimmed)) {
      const next1 = lines[i + 1]?.trim() ?? "";
      const next2 = lines[i + 2]?.trim() ?? "";
      if (contactLineRegex.test(next1) || contactLineRegex.test(next2)) {
        // If the line preceding the separator is a name/title line, cut from there
        const prev = i > 0 ? lines[i - 1].trim() : "";
        if (prev && !prev.includes(":") && prev.length < 80) {
          cutIndex = i - 1;
        } else {
          cutIndex = i;
        }
        break;
      }
    }
  }

  const resultLines = lines.slice(0, cutIndex);

  // Trim trailing empty lines or stray separators
  while (
    resultLines.length > 0 &&
    (resultLines[resultLines.length - 1].trim() === "" ||
      separatorLineRegex.test(resultLines[resultLines.length - 1].trim()))
  ) {
    resultLines.pop();
  }

  return resultLines.join("\n").trim();
}

function extractLabel(
  subject: string,
  body: string,
  keys: string[]
): string | null {
  const combined = `${subject}\n${body}`;
  for (const key of keys) {
    const re = new RegExp(
      `(?:^|\\n)\\s*${key}\\s*[:\\-]\\s*(.+)$`,
      "im"
    );
    const match = combined.match(re);
    if (match) return match[1].trim().slice(0, 120);
  }
  const bracket = subject.match(/^\[([^\]]+)\]/);
  if (bracket && keys.includes("department")) {
    return bracket[1].trim().slice(0, 120);
  }
  return null;
}

function looksLikeAutoReply(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  subject: string
): boolean {
  const autoSubmitted = header(headers, "Auto-Submitted");
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") return true;
  if (header(headers, "X-Autoreply") || header(headers, "X-Autorespond")) {
    return true;
  }
  if (/^(auto(matic)?[- ]?reply|out of office|ooo):/i.test(subject)) {
    return true;
  }
  return false;
}

export function parseGmailMessage(message: {
  id?: string | null;
  threadId?: string | null;
  snippet?: string | null;
  payload?: MimePart & {
    headers?: Array<{ name?: string | null; value?: string | null }> | null;
  } | null;
  internalDate?: string | null;
}): ParsedMessage {
  const headers = message.payload?.headers ?? [];
  const subject = header(headers, "Subject") ?? "(no subject)";
  const from = parseAddressList(header(headers, "From"))[0] ?? null;
  const to = parseAddressList(header(headers, "To"));
  const cc = parseAddressList(header(headers, "Cc"));
  const dateHeader = header(headers, "Date");
  const date = dateHeader
    ? new Date(dateHeader)
    : message.internalDate
      ? new Date(Number(message.internalDate))
      : new Date();

  const textParts: string[] = [];
  collectTextParts(message.payload ?? undefined, textParts);
  let bodyText = textParts.join("\n").trim();
  if (!bodyText) {
    const htmlParts: string[] = [];
    collectHtmlParts(message.payload ?? undefined, htmlParts);
    bodyText = htmlToText(htmlParts.join("\n"));
  }
  bodyText = stripSignature(stripQuotedHistory(bodyText));

  const department =
    extractLabel(subject, bodyText, ["department", "dept"]) ??
    extractLabel(subject, bodyText, ["department"]);
  const project = extractLabel(subject, bodyText, ["project"]);

  return {
    gmailMessageId: message.id ?? "",
    threadId: message.threadId ?? "",
    messageIdHeader: header(headers, "Message-ID") ?? header(headers, "Message-Id"),
    inReplyTo: header(headers, "In-Reply-To"),
    references: header(headers, "References"),
    subject,
    from,
    to,
    cc,
    date: Number.isNaN(date.getTime()) ? new Date() : date,
    bodyText,
    snippet: message.snippet ?? bodyText.slice(0, 180),
    department,
    project,
    isAutoReply: looksLikeAutoReply(headers, subject),
    isFromMonitorInbox: from?.email === MONITOR,
  };
}

export function partiesFromParsed(parsed: ParsedMessage): {
  requester: ParsedAddress;
  approvers: ParsedAddress[];
  participants: ParsedAddress[];
} {
  if (!parsed.from) {
    throw new Error("Message has no From address");
  }
  const seen = new Set<string>([MONITOR, parsed.from.email]);
  const approvers: ParsedAddress[] = [];
  for (const addr of parsed.to) {
    if (seen.has(addr.email)) continue;
    seen.add(addr.email);
    approvers.push(addr);
  }
  const participants: ParsedAddress[] = [];
  for (const addr of parsed.cc) {
    if (seen.has(addr.email)) continue;
    seen.add(addr.email);
    participants.push(addr);
  }
  return { requester: parsed.from, approvers, participants };
}

export function summarizeBody(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= 280) return compact;
  return `${compact.slice(0, 277)}...`;
}
