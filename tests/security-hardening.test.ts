import assert from "node:assert/strict";
import test from "node:test";
import { branchIdentityScope, branchRecordScope } from "../lib/branch-scope";
import { checkLoginRateLimit, clearLoginFailures, loginRateLimitPolicy, recordLoginFailure, resetLoginRateLimitsForTests } from "../lib/login-rate-limit";
import { sessionSecret } from "../lib/session-security";

test("production refuses a missing or short session secret", () => {
  assert.throws(() => sessionSecret({ NODE_ENV: "production" }), /SESSION_SECRET/);
  assert.throws(() => sessionSecret({ NODE_ENV: "production", SESSION_SECRET: "short" }), /at least 32/);
  assert.equal(sessionSecret({ NODE_ENV: "production", SESSION_SECRET: "x".repeat(32) }), "x".repeat(32));
});

test("login attempts are blocked after the configured failure threshold", () => {
  resetLoginRateLimitsForTests();
  const now = 1_000_000;
  for (let index = 0; index < loginRateLimitPolicy.maximumFailures; index += 1) recordLoginFailure("User@Example.com", "127.0.0.1", now + index);
  const blocked = checkLoginRateLimit("user@example.com", "127.0.0.1", now + 10);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  clearLoginFailures("USER@example.com", "127.0.0.1");
  assert.equal(checkLoginRateLimit("user@example.com", "127.0.0.1", now + 10).allowed, true);
});

test("login throttling separates accounts and IP addresses", () => {
  resetLoginRateLimitsForTests();
  for (let index = 0; index < loginRateLimitPolicy.maximumFailures; index += 1) recordLoginFailure("one@example.com", "10.0.0.1", index);
  assert.equal(checkLoginRateLimit("two@example.com", "10.0.0.1", 10).allowed, true);
  assert.equal(checkLoginRateLimit("one@example.com", "10.0.0.2", 10).allowed, true);
});

test("branch scopes deny empty assignments instead of widening access", () => {
  assert.deepEqual(branchIdentityScope(null), {});
  assert.deepEqual(branchIdentityScope([]), { id: -1 });
  assert.deepEqual(branchIdentityScope([2, 4]), { id: { in: [2, 4] } });
  assert.deepEqual(branchRecordScope([]), { branchId: -1 });
  assert.deepEqual(branchRecordScope([2, 4]), { branchId: { in: [2, 4] } });
});
