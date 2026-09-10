// Employee.employeeId is BIGINT (central_db's emp_id, ~15-16 digits — still
// within Number.MAX_SAFE_INTEGER but not representable as JSON. Serialize as
// a string across every response instead of asking each site to convert.)
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { authRoutes } from "./routes/auth.js";
import { approvalRoutes } from "./routes/approvals.js";
import { adminRoutes } from "./routes/admin.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { gmailSetupRoutes } from "./routes/gmail-setup.js";
import { startScheduler } from "./jobs/scheduler.js";
import { registerOriginGuard } from "./lib/origin-guard.js";

async function build() {
  const app = Fastify({
    logger: {
      level: config.isDev ? "info" : "warn",
    },
    bodyLimit: 256 * 1024,
    trustProxy: true,
    requestTimeout: 30_000,
  });

  const origins = [config.frontendUrl, config.corsOrigin].filter(Boolean);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(sensible);
  await app.register(rateLimit, {
    global: true,
    max: config.isProd ? 120 : 300,
    timeWindow: "1 minute",
    allowList: (req) => {
      const path = req.url.split("?")[0] ?? "";
      return path === "/health" || path.startsWith("/webhooks/");
    },
  });

  registerOriginGuard(app);

  app.get("/health", async () => ({ ok: true, env: config.nodeEnv }));

  await app.register(authRoutes);
  await app.register(approvalRoutes);
  await app.register(adminRoutes);
  await app.register(webhookRoutes);
  await app.register(gmailSetupRoutes);

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, "Unhandled error");
    }
    const message =
      status >= 500 && config.isProd
        ? "Internal Server Error"
        : error.message || "Error";
    reply.code(status).send({
      statusCode: status,
      error: message,
      message,
    });
  });

  return app;
}

async function start() {
  const app = await build();
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.log.info(`Approvals API listening on ${config.port}`);
    startScheduler();
  } catch (err) {
    app.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

void start();
