import dotenv from "dotenv";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const candidates = [
  path.resolve(process.cwd(), "backend/.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../../.env"),
];

for (const file of candidates) {
  if (existsSync(file)) {
    try {
      const parsed = dotenv.parse(readFileSync(file, "utf8"));
      for (const [key, value] of Object.entries(parsed)) {
        const val = value.trim();
        const current = process.env[key]?.trim();
        if (val !== "" && (!current || current === "")) {
          process.env[key] = val;
        } else if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    } catch {
      dotenv.config({ path: file });
    }
  }
}

function required(name: string, fallback?: string): string {
  const raw = process.env[name];
  const value = raw && raw.trim() !== "" ? raw.trim() : fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  const raw = process.env[name];
  if (raw !== undefined && raw.trim() !== "") {
    return raw.trim();
  }
  return fallback;
}

const nodeEnv = optional("NODE_ENV", "development");
const isDev = nodeEnv !== "production";
const isProd = nodeEnv === "production";

const jwtSecret = required("JWT_SECRET", "dev-only-change-me");
if (isProd) {
  if (jwtSecret.length < 32 || jwtSecret.includes("change-me") || jwtSecret.includes("dev-")) {
    throw new Error(
      "JWT_SECRET must be a strong random string (32+ chars) in production"
    );
  }
  if (!optional("GMAIL_PUSH_TOKEN")) {
    throw new Error("GMAIL_PUSH_TOKEN is required in production");
  }
}

/** Session lifetime (seconds). Org default: 12 hours. */
export const SESSION_MAX_AGE_SECONDS = Number(
  optional("SESSION_MAX_AGE_SECONDS", String(60 * 60 * 12))
);

export const config = {
  port: Number(optional("PORT", "3001")),
  nodeEnv,
  isDev,
  isProd,
  frontendUrl: optional("FRONTEND_URL", "http://localhost:3000"),
  corsOrigin: optional("CORS_ORIGIN"),
  jwtSecret,
  loginAuthJwtSecret: optional("LOGIN_AUTH_JWT_SECRET", jwtSecret),
  loginAuthIssuer: optional("LOGIN_AUTH_ISSUER"),
  loginAuthAudience: optional("LOGIN_AUTH_AUDIENCE"),
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://approvals:approvals@localhost:5432/approvals"
  ),
  centralDbUrl: optional("CENTRAL_DB_URL", "http://127.0.0.1:8000"),
  approvalsApiKey: optional("APPROVALS_API_KEY"),
  /** Allow admin email simulation only outside production */
  allowSimulateEmail: !isProd && optional("ALLOW_SIMULATE_EMAIL", "true") === "true",
  /** Allow direct test email login without SSO in dev mode */
  allowDevLogin: !isProd && optional("ALLOW_DEV_LOGIN", "true") === "true",
  /** Fallback to mock central db when central_db is unreachable in dev mode */
  mockCentralDb: !isProd && optional("MOCK_CENTRAL_DB", "true") === "true",
  gmail: {
    clientId: optional("GOOGLE_CLIENT_ID"),
    clientSecret: optional("GOOGLE_CLIENT_SECRET"),
    redirectUri: optional(
      "GOOGLE_REDIRECT_URI",
      "http://localhost:3001/gmail/oauth/callback"
    ),
    user: optional("GMAIL_USER", "approvals@gmail.com"),
    refreshToken: optional("GMAIL_REFRESH_TOKEN"),
    pubsubTopic: optional("GMAIL_PUBSUB_TOPIC"),
    pushToken: optional("GMAIL_PUSH_TOKEN"),
    reconcileMinutes: Number(optional("GMAIL_RECONCILE_MINUTES", "5")),
  },
};

export function gmailConfigured(): boolean {
  const g = config.gmail;
  return Boolean(g.clientId && g.clientSecret && g.refreshToken);
}
