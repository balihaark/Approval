import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { logActivity } from "../lib/audit.js";
import {
  exchangeCodeForTokens,
  getAuthUrl,
} from "../lib/gmail/client.js";
import { config } from "../config.js";
import {
  requireAdmin,
  setOAuthStateCookie,
  takeOAuthStateCookie,
} from "../plugins/auth.js";
import { safeEqual } from "../lib/security.js";

function upsertEnvValue(filePath: string, key: string, value: string): void {
  if (!existsSync(filePath)) return;
  const current = readFileSync(filePath, "utf8");
  const line = `${key}=${value}`;
  const next = new RegExp(`^${key}=.*$`, "m").test(current)
    ? current.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${current.trimEnd()}\n${line}\n`;
  writeFileSync(filePath, next);
}

async function handleOAuthCallback(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const query = request.query as {
    code?: string;
    error?: string;
    state?: string;
  };
  if (query.error) {
    return reply
      .type("text/html")
      .send(`<html><body><p>OAuth error: ${query.error}</p></body></html>`);
  }
  if (!query.code) {
    return reply.badRequest("Missing code");
  }

  const expected = takeOAuthStateCookie(request, reply);
  if (!expected || !query.state || !safeEqual(expected, query.state)) {
    return reply.forbidden("Invalid OAuth state");
  }

  const tokens = await exchangeCodeForTokens(query.code);
  await logActivity({
    actorEmail: config.gmail.user,
    action: "gmail.oauth.connected",
    details: {
      hasRefreshToken: Boolean(tokens.refresh_token),
      expiry: tokens.expiry_date ?? null,
    },
  });

  const refresh = tokens.refresh_token ?? "";
  if (refresh) {
    for (const file of [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "backend/.env"),
      path.resolve(process.cwd(), "../.env"),
    ]) {
      upsertEnvValue(file, "GMAIL_REFRESH_TOKEN", refresh);
    }
  }

  const html = `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px">
  <h1>Gmail connected</h1>
  <p>Signed in mailbox should be <strong>${config.gmail.user}</strong>.</p>
  <p>${refresh ? "Refresh token saved to <code>.env</code>. Restart the backend so ingestion can start." : "No refresh token was returned. Revoke the app at <a href=\"https://myaccount.google.com/permissions\">Google account permissions</a> and try again."}</p>
  <p><a href="${config.frontendUrl}/admin/gmail">Back to Gmail settings</a></p>
</body></html>`;
  return reply.type("text/html").send(html);
}

export async function gmailSetupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/gmail/oauth/start", { preHandler: requireAdmin }, async (_request, reply) => {
    if (!config.gmail.clientId || !config.gmail.clientSecret) {
      throw app.httpErrors.badRequest(
        "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first"
      );
    }
    const state = randomBytes(24).toString("hex");
    setOAuthStateCookie(reply, state);
    return { url: getAuthUrl(state) };
  });

  app.get("/gmail/oauth/callback", handleOAuthCallback);
  app.get("/gmail/oauth2callback", handleOAuthCallback);
}
