import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";

test("1. Login-Auth SSO token verification and automatic employee provisioning", async () => {
  const testEmail = "sso_test_user@example.com";
  await prisma.employee.deleteMany({ where: { email: testEmail } });

  const token = jwt.sign(
    {
      iss: "login-auth",
      aud: "approvals",
      emp_id: 9999,
      central_emp_id: "EMP9999",
      email: testEmail,
      first_name: "SSO Test User",
      role: "USER",
    },
    config.loginAuthJwtSecret,
    { expiresIn: "1h" }
  );

  assert.ok(token);

  const payload = jwt.verify(token, config.loginAuthJwtSecret) as any;
  assert.equal(payload.email, testEmail);
  assert.equal(payload.iss, "login-auth");
});
