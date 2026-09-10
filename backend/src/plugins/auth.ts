import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { UserRole } from "@prisma/client";
import { config, SESSION_MAX_AGE_SECONDS } from "../config.js";
import {
  getEmployeeById,
  CentralDbError,
} from "../services/centralDb.service.js";

export type AuthUser = {
  id: bigint;
  email: string;
  name: string;
  role: UserRole;
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

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
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
    let employeeId: bigint;
    try {
      employeeId = BigInt(payload.sub);
    } catch {
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

    // Fail-closed re-verify against central: HR-side deactivation in central
    // must revoke approvals access within one request. Matches LMA's
    // dependencies.verify_token pattern.
    try {
      const central = await getEmployeeById(user.employeeId);
      if (!central || central.is_active === false) {
        await prisma.employee.update({
          where: { employeeId: user.employeeId },
          data: { isActive: false, tokenVersion: { increment: 1 } },
        });
        clearAuthCookie(reply);
        return reply.unauthorized("Account is inactive");
      }
    } catch (err) {
      if (err instanceof CentralDbError) {
        request.log.error(
          { err },
          "central_db unreachable during authenticate"
        );
        return reply
          .code(err.status >= 500 ? err.status : 503)
          .send({ error: "identity service unavailable" });
      }
      throw err;
    }

    request.currentUser = {
      id: user.employeeId,
      email: user.email,
      name: user.name,
      role: user.role,
    };
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
  user: {
    employeeId: bigint;
    email: string;
    role: UserRole;
    tokenVersion: number;
  }
): string {
  return app.jwt.sign(
    {
      sub: user.employeeId.toString(),
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
