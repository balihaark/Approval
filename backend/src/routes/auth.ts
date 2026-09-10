import { FastifyInstance } from "fastify";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  clearAuthCookie,
  setAuthCookie,
  signSessionToken,
} from "../plugins/auth.js";
import { normalizeEmail } from "../lib/access.js";
import { logActivity } from "../lib/audit.js";
import { config, SESSION_MAX_AGE_SECONDS } from "../config.js";
import {
  getEmployeeByEmail,
  CentralDbError,
  fullName,
  CentralEmployee,
} from "../services/centralDb.service.js";

const ssoCallbackSchema = z.object({
  token: z.string().min(1),
});

type SsoPayload = {
  email?: string;
  emp_id?: number | string;
  central_emp_id?: number | string;
  first_name?: string;
  iss?: string;
};

function projectedName(central: CentralEmployee, payload: SsoPayload): string {
  const fromCentral = fullName(central);
  if (fromCentral) return fromCentral;
  if (typeof payload.first_name === "string" && payload.first_name.trim() !== "") {
    return payload.first_name.trim();
  }
  return central.email.split("@")[0] || "Employee";
}

function publicUser(user: {
  employeeId: bigint;
  email: string;
  name: string;
  role: UserRole;
}) {
  return {
    id: user.employeeId.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/sso/callback",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parsed = ssoCallbackSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest("Token is required");
      }

      let payload: SsoPayload;
      try {
        payload = jwt.verify(parsed.data.token, config.loginAuthJwtSecret, {
          algorithms: ["HS256"],
          ...(config.loginAuthIssuer ? { issuer: config.loginAuthIssuer } : {}),
          ...(config.loginAuthAudience
            ? { audience: config.loginAuthAudience }
            : {}),
        }) as SsoPayload;
      } catch {
        return reply.unauthorized("Invalid or expired SSO token");
      }

      if (!payload || typeof payload !== "object" || !payload.email) {
        return reply.unauthorized("Invalid SSO token claims");
      }

      const email = normalizeEmail(String(payload.email));

      // Central is authoritative for identity + activity gate.
      // Fail-closed on outage (matches LMA + HR Portal cutover pattern).
      let central: CentralEmployee | null;
      try {
        central = await getEmployeeByEmail(email);
      } catch (err) {
        if (err instanceof CentralDbError) {
          request.log.error({ err }, "central_db unreachable during SSO");
          return reply
            .code(err.status >= 500 ? err.status : 503)
            .send({ error: "identity service unavailable" });
        }
        throw err;
      }

      if (!central) {
        await logActivity({
          actorEmail: email,
          action: "auth.sso.login.rejected",
          details: { reason: "not_in_central" },
        });
        return reply.unauthorized("Employee not found in central directory");
      }

      // Central computes is_active from employment_status + exit_date; trust it.
      if (central.is_active === false) {
        await logActivity({
          actorEmail: email,
          action: "auth.sso.login.rejected",
          details: { reason: "inactive_in_central" },
        });
        return reply.unauthorized("Account is inactive");
      }

      const empId = BigInt(central.emp_id);
      const projectedEmail = normalizeEmail(central.email);
      const name = projectedName(central, payload);

      // Upsert local projection. Preserve locally-managed `role` on re-login
      // (see decision_approvals_admin_manual — ADMIN is set by dev SQL, not
      // by anything in the SSO payload or central).
      const user = await prisma.employee.upsert({
        where: { employeeId: empId },
        create: {
          employeeId: empId,
          email: projectedEmail,
          name,
          role: UserRole.USER,
          isActive: true,
          lastLoginAt: new Date(),
          tokenVersion: 1,
        },
        update: {
          email: projectedEmail,
          name,
          isActive: true,
          lastLoginAt: new Date(),
        },
      });

      const sessionToken = signSessionToken(app, user);
      setAuthCookie(reply, sessionToken, SESSION_MAX_AGE_SECONDS);

      await logActivity({
        actorEmail: user.email,
        action: "auth.sso.login.success",
        details: {
          issuer: payload.iss || "login-auth",
          empId: user.employeeId.toString(),
        },
      });

      return { user: publicUser(user) };
    }
  );

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies?.["approvals_token"];
    clearAuthCookie(reply);
    try {
      if (token) {
        const payload = app.jwt.verify<{ sub: string; email: string }>(token);
        const employeeId = BigInt(payload.sub);
        await prisma.employee.update({
          where: { employeeId },
          data: { tokenVersion: { increment: 1 } },
        });
        await logActivity({
          actorEmail: payload.email,
          action: "auth.logout",
          details: {},
        });
      }
    } catch {
      // invalid cookie on logout is fine — the client is asking to be logged out anyway
    }
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: authenticate }, async (request) => {
    return {
      user: publicUser({
        employeeId: request.currentUser.id,
        email: request.currentUser.email,
        name: request.currentUser.name,
        role: request.currentUser.role,
      }),
    };
  });
}
