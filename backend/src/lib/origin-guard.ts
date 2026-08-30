import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { URL } from "node:url";
import { config } from "../config.js";

function allowedOrigins(): Set<string> {
  const list = [config.frontendUrl, config.corsOrigin].filter(Boolean) as string[];
  return new Set(list.map((o) => o.replace(/\/$/, "")));
}

/**
 * Reject cross-site mutating requests (CSRF defense for cookie sessions).
 * Webhooks and OAuth callbacks are excluded by route.
 */
export function registerOriginGuard(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const method = request.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

    const path = request.url.split("?")[0] ?? "";
    if (
      path.startsWith("/webhooks/") ||
      path.startsWith("/gmail/oauth/callback") ||
      path.startsWith("/gmail/oauth2callback") ||
      path === "/health"
    ) {
      return;
    }

    const origin = request.headers.origin;
    const referer = request.headers.referer;
    if (!origin && !referer) {
      // Non-browser clients (scripts) — allow in development only
      if (config.isDev) return;
      return reply.forbidden("Missing Origin");
    }

    let candidate = origin ?? null;
    if (!candidate && referer) {
      try {
        candidate = new URL(referer).origin;
      } catch {
        return reply.forbidden("Invalid Referer");
      }
    }

    if (!candidate || !allowedOrigins().has(candidate.replace(/\/$/, ""))) {
      return reply.forbidden("Origin not allowed");
    }
  });
}

export async function sendSafeError(
  reply: FastifyReply,
  status: number,
  publicMessage: string,
  request: FastifyRequest,
  err?: unknown
): Promise<void> {
  if (err) {
    request.log.error({ err }, publicMessage);
  }
  return reply.code(status).send({
    statusCode: status,
    error: publicMessage,
    message: publicMessage,
  });
}
