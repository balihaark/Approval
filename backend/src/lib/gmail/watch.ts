import { getGmail } from "./client.js";
import { config } from "../../config.js";
import { prisma } from "../prisma.js";
import { logActivity } from "../audit.js";

const WATCH_LABELS = ["INBOX"];

export async function renewGmailWatch(): Promise<{
  historyId: string | null;
  expiration: Date | null;
}> {
  if (!config.gmail.pubsubTopic) {
    throw new Error("GMAIL_PUBSUB_TOPIC is not set");
  }
  const gmail = getGmail();
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: config.gmail.pubsubTopic,
      labelIds: WATCH_LABELS,
    },
  });
  const expiration = res.data.expiration
    ? new Date(Number(res.data.expiration))
    : null;
  const historyId = res.data.historyId ? String(res.data.historyId) : null;

  await prisma.gmailSyncState.upsert({
    where: { id: "default" },
    create: { id: "default", historyId, watchExpiry: expiration },
    update: { historyId: historyId ?? undefined, watchExpiry: expiration },
  });

  await logActivity({
    actorEmail: config.gmail.user,
    action: "gmail.watch.renewed",
    details: { historyId, expiration: expiration?.toISOString() ?? null },
  });

  return { historyId, expiration };
}

export async function ensureWatchFresh(): Promise<void> {
  if (!config.gmail.pubsubTopic) return;
  const state = await prisma.gmailSyncState.findUnique({
    where: { id: "default" },
  });
  const expiry = state?.watchExpiry;
  const oneDay = 24 * 60 * 60 * 1000;
  if (!expiry || expiry.getTime() - Date.now() < oneDay) {
    await renewGmailWatch();
  }
}
