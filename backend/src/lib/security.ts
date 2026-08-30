import { timingSafeEqual } from "node:crypto";

/** Constant-time string compare (UTF-8). Length mismatch still costs a compare. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function assertPasswordPolicy(password: string): string | null {
  if (password.length < 12) {
    return "Password must be at least 12 characters";
  }
  if (password.length > 128) {
    return "Password must be at most 128 characters";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include a lowercase letter";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include an uppercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include a number";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must include a symbol";
  }
  const lowered = password.toLowerCase();
  const banned = ["password", "blauplug", "approvals", "changeme123"];
  if (banned.some((w) => lowered.includes(w))) {
    return "Password is too common; choose a stronger one";
  }
  return null;
}
