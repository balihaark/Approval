import { config, gmailConfigured } from "../config.js";
import { ensureWatchFresh } from "../lib/gmail/watch.js";
import { handlePushNotification, reconcileRecent } from "../lib/gmail/ingestion.js";
import { prisma } from "../lib/prisma.js";

let running = false;

async function runReconcile(): Promise<void> {
  if (!gmailConfigured() || running) return;
  running = true;
  try {
    const state = await prisma.gmailSyncState.findUnique({
      where: { id: "default" },
    });
    if (state?.historyId) {
      await handlePushNotification(state.historyId);
    } else {
      await reconcileRecent(40);
    }
  } catch (err) {
    console.error("[scheduler] reconcile failed", err);
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  const minutes = Math.max(1, config.gmail.reconcileMinutes);
  const interval = minutes * 60 * 1000;

  setInterval(() => {
    void runReconcile();
  }, interval);

  setInterval(() => {
    if (!gmailConfigured()) return;
    void ensureWatchFresh().catch((err) =>
      console.error("[scheduler] watch renewal failed", err)
    );
  }, 6 * 60 * 60 * 1000);

  if (gmailConfigured()) {
    void ensureWatchFresh().catch((err) =>
      console.error("[scheduler] initial watch failed", err)
    );
    void runReconcile();
  }
}
