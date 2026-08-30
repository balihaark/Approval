import { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { handlePushNotification } from "../lib/gmail/ingestion.js";
import { safeEqual } from "../lib/security.js";

type PushBody = {
  message?: {
    data?: string;
    messageId?: string;
  };
  subscription?: string;
};

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/webhooks/gmail", async (request, reply) => {
    const token = (request.query as { token?: string }).token ?? "";
    const expected = config.gmail.pushToken ?? "";

    if (config.isProd || expected) {
      if (!expected || !token || !safeEqual(token, expected)) {
        return reply.unauthorized("Invalid push token");
      }
    }

    const body = request.body as PushBody;
    const data = body?.message?.data;
    if (!data) {
      return reply.code(204).send();
    }

    let historyId: string | undefined;
    try {
      const decoded = JSON.parse(
        Buffer.from(data, "base64").toString("utf8")
      ) as { emailAddress?: string; historyId?: string | number };
      historyId = decoded.historyId ? String(decoded.historyId) : undefined;
    } catch {
      request.log.warn("Gmail push payload was not valid JSON");
      return reply.code(204).send();
    }

    if (historyId) {
      try {
        await handlePushNotification(historyId);
      } catch (err) {
        request.log.error({ err }, "Failed to process Gmail push");
        return reply.code(500).send({ error: "Ingestion failed" });
      }
    }

    return { ok: true };
  });
}
