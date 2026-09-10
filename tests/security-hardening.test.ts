import assert from "node:assert/strict";
import { readsWholeOrganizationFrom } from "../lib/officer-scope";
import test from "node:test";
import { branchIdentityScope, branchRecordScope } from "../lib/branch-scope";
import { checkLoginRateLimit, clearLoginFailures, loginRateLimitPolicy, recordLoginFailure, resetLoginRateLimitsForTests } from "../lib/login-rate-limit";
import { sessionSecret } from "../lib/session-security";
import { createSessionToken, hasOrganizationWideBranchAccess, verifySessionToken } from "../lib/auth";
import { addressMatches, isAddressAllowed, isValidAllowlistAddress } from "../lib/login-ip-allowlist";

test("production refuses a missing or short session secret", () => {
  assert.throws(() => sessionSecret({ NODE_ENV: "production" }), /SESSION_SECRET/);
  assert.throws(() => sessionSecret({ NODE_ENV: "production", SESSION_SECRET: "short" }), /at least 32/);
  assert.equal(sessionSecret({ NODE_ENV: "production", SESSION_SECRET: "x".repeat(32) }), "x".repeat(32));
});

test("sessions expire server-side and reject legacy payloads without an expiry", () => {
  const originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret-that-is-long-enough";
  try {
    const token = createSessionToken({ id: 1, name: "Test", email: "test@example.com", role: "ADMIN", sessionVersion: 2 });
    const session = verifySessionToken(token);
    assert.equal(session?.sessionVersion, 2);
    assert.equal(verifySessionToken(token, session!.expiresAt), null);
  } finally {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  }
});

test("HO TL receives organization-wide branch scope", () => {
  const user = { role: "INQUIRY_USER" as const, allBranches: false, position: null };
  assert.equal(hasOrganizationWideBranchAccess(user, "HO TL"), true);
  assert.equal(hasOrganizationWideBranchAccess({ ...user, position: " ho tl " }), true);
  assert.equal(hasOrganizationWideBranchAccess(user, "Branch TL"), false);
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

test("an empty or fully disabled allowlist never blocks anyone", () => {
  assert.equal(isAddressAllowed("203.0.113.9", []), true);
  assert.equal(isAddressAllowed("203.0.113.9", [{ address: "192.168.4.0/24", enabled: false }]), true);
  assert.equal(isAddressAllowed(null, []), true);
});

test("an active allowlist admits its own addresses and ranges only", () => {
  const entries = [
    { address: "192.168.4.0/24", enabled: true },
    { address: "203.0.113.7", enabled: true }
  ];
  assert.equal(isAddressAllowed("192.168.4.200", entries), true);
  assert.equal(isAddressAllowed("192.168.5.200", entries), false);
  assert.equal(isAddressAllowed("203.0.113.7", entries), true);
  assert.equal(isAddressAllowed("154.16.112.232", entries), false);
  // A request whose address cannot be read is refused while the list is in force.
  assert.equal(isAddressAllowed(null, entries), false);
});

test("allowlist addresses are validated before they can be stored", () => {
  assert.equal(isValidAllowlistAddress("192.168.4.200"), true);
  assert.equal(isValidAllowlistAddress("192.168.4.0/24"), true);
  assert.equal(isValidAllowlistAddress("192.168.4.0/33"), false);
  assert.equal(isValidAllowlistAddress("999.1.1.1"), false);
  assert.equal(isValidAllowlistAddress(""), false);
});

test("a /32 matches one host and a /0 matches everything", () => {
  assert.equal(addressMatches("10.0.0.5", "10.0.0.5/32"), true);
  assert.equal(addressMatches("10.0.0.6", "10.0.0.5/32"), false);
  assert.equal(addressMatches("10.0.0.6", "0.0.0.0/0"), true);
});

// Who the My Schedule / My Clients picker lets a reader choose from. The all-branches flag is
// set on every team leader on the books - it says which branches' data they may read - so
// mistaking it for "answers for the whole company" would hand each of them every officer in
// the organisation instead of the one team they lead.
test("only an administrator or HO TL picks from every area and branch", () => {
  assert.equal(readsWholeOrganizationFrom("ADMIN", null), true);
  assert.equal(readsWholeOrganizationFrom("CREDIT_COMMITTEE", "HO TL"), true, "carried by position");
  assert.equal(readsWholeOrganizationFrom("INQUIRY_USER", null, " ho tl "), true, "or by privilege template");
  assert.equal(readsWholeOrganizationFrom("AREA_TEAM_LEADER", "Area TL"), false);
  assert.equal(readsWholeOrganizationFrom("INQUIRY_USER", "Branch TL"), false);
  assert.equal(readsWholeOrganizationFrom("ACCOUNT_OFFICER", null), false);
});
