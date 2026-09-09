import { prisma } from "@/lib/prisma";

type LoginAttempt = {
  failures: number[];
  blockedUntil: number | null;
};

const attempts = new Map<string, LoginAttempt>();

export const loginRateLimitPolicy = {
  maximumFailures: 5,
  failureWindowMs: 15 * 60 * 1000,
  blockDurationMs: 15 * 60 * 1000
} as const;

function normalizeKey(email: unknown, ipAddress: string | null) {
  const account = typeof email === "string" ? email.trim().toLocaleLowerCase("en") : "unknown";
  return `${ipAddress || "unknown"}:${account}`;
}

function currentAttempt(key: string, now: number) {
  const existing = attempts.get(key) ?? { failures: [], blockedUntil: null };
  existing.failures = existing.failures.filter((timestamp) => now - timestamp < loginRateLimitPolicy.failureWindowMs);
  if (existing.blockedUntil !== null && existing.blockedUntil <= now) existing.blockedUntil = null;
  if (!existing.failures.length && existing.blockedUntil === null) attempts.delete(key);
  return existing;
}

export function checkLoginRateLimit(email: unknown, ipAddress: string | null, now = Date.now()) {
  const key = normalizeKey(email, ipAddress);
  const attempt = currentAttempt(key, now);
  const retryAfterSeconds = attempt.blockedUntil === null ? 0 : Math.max(1, Math.ceil((attempt.blockedUntil - now) / 1000));
  return { allowed: retryAfterSeconds === 0, retryAfterSeconds };
}

export function recordLoginFailure(email: unknown, ipAddress: string | null, now = Date.now()) {
  const key = normalizeKey(email, ipAddress);
  const attempt = currentAttempt(key, now);
  attempt.failures.push(now);
  if (attempt.failures.length >= loginRateLimitPolicy.maximumFailures) {
    attempt.blockedUntil = now + loginRateLimitPolicy.blockDurationMs;
  }
  attempts.set(key, attempt);
  return checkLoginRateLimit(email, ipAddress, now);
}

export function clearLoginFailures(email: unknown, ipAddress: string | null) {
  attempts.delete(normalizeKey(email, ipAddress));
}

export function resetLoginRateLimitsForTests() {
  attempts.clear();
}

// The in-memory limiter handles bursts without a database round-trip after every failure. This
// second check survives restarts and works across multiple app processes by using the audit trail.
export async function checkPersistentLoginRateLimit(email: unknown, ipAddress: string | null, now = Date.now()) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLocaleLowerCase("en") : "unknown";
  const windowStart = new Date(now - loginRateLimitPolicy.failureWindowMs);
  const identity = { userEmail: normalizedEmail, ipAddress };
  const lastSuccess = await prisma.auditLog.findFirst({
    where: { ...identity, action: "LOGIN", createdAt: { gte: windowStart } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });
  const failures = await prisma.auditLog.findMany({
    where: {
      ...identity,
      action: "LOGIN_FAILED",
      createdAt: { gt: lastSuccess?.createdAt ?? windowStart }
    },
    orderBy: { createdAt: "desc" },
    take: loginRateLimitPolicy.maximumFailures,
    select: { createdAt: true }
  });
  if (failures.length < loginRateLimitPolicy.maximumFailures) return { allowed: true, retryAfterSeconds: 0 };
  const blockedUntil = failures[0].createdAt.getTime() + loginRateLimitPolicy.blockDurationMs;
  const retryAfterSeconds = Math.max(0, Math.ceil((blockedUntil - now) / 1000));
  return { allowed: retryAfterSeconds === 0, retryAfterSeconds };
}
