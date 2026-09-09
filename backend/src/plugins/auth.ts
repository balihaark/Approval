import { FastifyReply, FastifyRequest } from "fastify";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { config, SESSION_MAX_AGE_SECONDS } from "../config.js";

export type AuthUser = { id: number; email: string; name: string; role: UserRole };
export type SsoClaims = { emp_id: number; email: string; first_name?: string; role?: string };

declare module "fastify" { interface FastifyRequest { currentUser: AuthUser; } }

export const COOKIE_NAME = "approvals_token";
const OAUTH_STATE_COOKIE = "gmail_oauth_state";

function roleFromSso(role?: string): UserRole {
  return role?.toUpperCase() === "ADMIN" ? UserRole.ADMIN : UserRole.USER;
}

/** Verifies the shared-secret JWT issued by Login-Auth. */
export function verifySsoToken(request: FastifyRequest, token: string): SsoClaims {
  const payload = request.server.jwt.verify<SsoClaims>(token);
  if (!Number.isInteger(payload.emp_id) || payload.emp_id <= 0 || !payload.email) {
    throw new Error("Invalid Login-Auth session");
  }
  return payload;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const token = request.cookies[COOKIE_NAME];
    if (!token) return reply.unauthorized("Authentication required");
    const payload = verifySsoToken(request, token);
    const email = payload.email.trim().toLowerCase();
    const employee = await prisma.employee.upsert({
      where: { employeeId: payload.emp_id },
      create: { employeeId: payload.emp_id, email, name: payload.first_name?.trim() || email, role: roleFromSso(payload.role), lastLoginAt: new Date() },
      update: { email, name: payload.first_name?.trim() || email, role: roleFromSso(payload.role), isActive: true, lastLoginAt: new Date() },
    });
    request.currentUser = { id: employee.employeeId, email: employee.email, name: employee.name, role: employee.role };
  } catch {
    clearAuthCookie(reply);
    return reply.unauthorized("Invalid or expired Login-Auth session");
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authenticate(request, reply);
  if (!reply.sent && request.currentUser.role !== UserRole.ADMIN) return reply.forbidden("Admin role required");
}

export function setAuthCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/", maxAge: SESSION_MAX_AGE_SECONDS });
}

export function clearAuthCookie(reply: FastifyReply): void { reply.clearCookie(COOKIE_NAME, { path: "/" }); }
export function setOAuthStateCookie(reply: FastifyReply, state: string): void {
  reply.setCookie(OAUTH_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/", maxAge: 600 });
}
export function takeOAuthStateCookie(request: FastifyRequest, reply: FastifyReply): string | undefined {
  const state = request.cookies[OAUTH_STATE_COOKIE]; reply.clearCookie(OAUTH_STATE_COOKIE, { path: "/" }); return state;
}
export function registerAuthHelpers(): void {}
