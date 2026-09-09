import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { UserRole } from "@prisma/client";
import { config, SESSION_MAX_AGE_SECONDS } from "../config.js";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  mustChangePassword: boolean;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      role: UserRole;
      tv: number;
    };
    user: {
      sub: string;
      email: string;
      role: UserRole;
      tv: number;
    };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser: AuthUser;
  }
}

export const COOKIE_NAME = "approvals_token";
const OAUTH_STATE_COOKIE = "gmail_oauth_state";

const PASSWORD_CHANGE_PATHS = new Set([
  "/auth/me",
  "/auth/logout",
  "/auth/change-password",
]);

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Cookie-only sessions (no Authorization bearer) — reduces token leakage risk
    const token = request.cookies[COOKIE_NAME];
    if (!token) {
      return reply.unauthorized("Authentication required");
    }
    const payload = request.server.jwt.verify<{
      sub: string;
      email: string;
      role: UserRole;
      tv?: number;
    }>(token);
    const employeeId = Number(payload.sub);
    if (!Number.isSafeInteger(employeeId)) {
      return reply.unauthorized("Invalid or expired session");
    }
    const user = await prisma.employee.findUnique({ where: { employeeId } });
    if (!user || !user.isActive) {
      clearAuthCookie(reply);
      return reply.unauthorized("Account is inactive or no longer exists");
    }
    if ((payload.tv ?? 0) !== user.tokenVersion) {
      clearAuthCookie(reply);
      return reply.unauthorized("Session expired; please sign in again");
    }
    request.currentUser = {
      id: user.employeeId,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };

    const path = request.url.split("?")[0] ?? "";
    if (
      user.mustChangePassword &&
      !PASSWORD_CHANGE_PATHS.has(path) &&
      request.method.toUpperCase() !== "OPTIONS"
    ) {
      return reply.forbidden("Password change required before continuing");
    }
  } catch {
    return reply.unauthorized("Invalid or expired session");
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await authenticate(request, reply);
  if (reply.sent) return;
  if (request.currentUser.role !== "ADMIN") {
    return reply.forbidden("Admin role required");
  }
}

export function setAuthCookie(
  reply: FastifyReply,
  token: string,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS
): void {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: "/" });
}

export function setOAuthStateCookie(reply: FastifyReply, state: string): void {
  reply.setCookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/",
    maxAge: 600,
  });
}

export function takeOAuthStateCookie(
  request: FastifyRequest,
  reply: FastifyReply
): string | undefined {
  const state = request.cookies[OAUTH_STATE_COOKIE];
  reply.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
  return state;
}

export function signSessionToken(
  app: FastifyInstance,
  user: { employeeId: number; email: string; role: UserRole; tokenVersion: number }
): string {
  return app.jwt.sign(
    {
      sub: String(user.employeeId),
      email: user.email,
      role: user.role,
      tv: user.tokenVersion,
    },
    { expiresIn: SESSION_MAX_AGE_SECONDS }
  );
}

export function registerAuthHelpers(_app: FastifyInstance): void {
  // JWT + cookie plugins are registered in index.ts
}
