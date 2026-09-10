import assert from "node:assert/strict";
import test from "node:test";
import { parseClientLogAmountFields } from "../lib/client-logs";
import { manilaDateKey } from "../lib/location-loan-aging";
import { clientLogTypeLabel, mergeClientLogTypes, normalizeClientLogType } from "../lib/client-log-types";

// The create route and the admin edit route both hand their body to parseClientLogAmountFields,
// so a ticked box that saves nothing, or a collection amount that survives an unticked box,
// would be a defect in both at once.

test("a ticked box has to carry both of its figures", () => {
  const ptp = parseClientLogAmountFields({ isPtp: true, newDate: "2026-09-30" });
  assert.deepEqual(ptp, { error: "Promise to pay needs both a PTP date and a PTP amount." });

  const collection = parseClientLogAmountFields({ isCollection: true, collectionAmount: "500" });
  assert.deepEqual(collection, { error: "Collection needs both a collection date and a collection amount." });
});

test("an unticked collection box discards whatever the form still held", () => {
  // The fields keep their values while hidden, so leaving them out of the payload is not
  // something the form can be trusted to do on its own.
  const parsed = parseClientLogAmountFields({
    isCollection: false,
    collectionDate: "2026-09-09",
    collectionAmount: "1500"
  });
  assert.ok(!("error" in parsed));
  assert.equal(parsed.collectionDate, null);
  assert.equal(parsed.collectionAmount, null);
});

test("both outcomes can be recorded on one log", () => {
  // A promise ahead and money already taken: the two dates run in opposite directions, so both
  // are relative to today rather than fixed, and the test cannot rot into the past.
  const promised = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const collected = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const parsed = parseClientLogAmountFields({
    isPtp: true,
    newDate: promised,
    newAmount: "2500.50",
    isCollection: true,
    collectionDate: collected,
    collectionAmount: "1000"
  });
  assert.ok(!("error" in parsed));
  assert.equal(parsed.isPtp, true);
  assert.equal(parsed.newDate?.toISOString(), `${promised}T00:00:00.000Z`);
  assert.equal(parsed.newAmount, 2500.5);
  assert.equal(parsed.collectionDate?.toISOString(), `${collected}T00:00:00.000Z`);
  assert.equal(parsed.collectionAmount, 1000);
});

test("a PTP date cannot be in the past", () => {
  const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.deepEqual(parseClientLogAmountFields({ isPtp: true, newDate: yesterday, newAmount: "1000" }), {
    error: "A PTP date cannot be in the past. Choose today or a later date."
  });

  // Today itself is a promise that can still be kept.
  const today = parseClientLogAmountFields({ isPtp: true, newDate: manilaDateKey(), newAmount: "1000" });
  assert.ok(!("error" in today));
});

test("an edit keeps the passed date the log was already saved with", () => {
  // Otherwise a log whose PTP came and went could never have its notes corrected.
  const passed = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const parsed = parseClientLogAmountFields(
    { isPtp: true, newDate: passed, newAmount: "1000" },
    { previousNewDate: new Date(`${passed}T00:00:00.000Z`) }
  );
  assert.ok(!("error" in parsed));

  // Moving it to a different past day is still refused.
  const moved = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.deepEqual(
    parseClientLogAmountFields({ isPtp: true, newDate: moved, newAmount: "1000" }, { previousNewDate: new Date(`${passed}T00:00:00.000Z`) }),
    { error: "A PTP date cannot be in the past. Choose today or a later date." }
  );
});

test("a collection cannot be dated ahead, because that would be a schedule", () => {
  // Only the PTP date puts a client on the officer's calendar. A collection is money already
  // handed over, so a future date on one is a mistake rather than a plan.
  const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.deepEqual(parseClientLogAmountFields({ isCollection: true, collectionDate: tomorrow, collectionAmount: "1000" }), {
    error: "A collection date cannot be in the future. Use the PTP date to schedule a follow-up."
  });

  // A PTP date ahead of today is exactly what the field is for, so it stays allowed.
  const ptp = parseClientLogAmountFields({ isPtp: true, newDate: tomorrow, newAmount: "1000" });
  assert.ok(!("error" in ptp));
});

test("a log with neither box ticked still saves", () => {
  const parsed = parseClientLogAmountFields({ notes: "Walk-in inquiry." });
  assert.deepEqual(parsed, { isPtp: false, newDate: null, newAmount: null, collectionDate: null, collectionAmount: null });
});

test("nonsense figures are refused", () => {
  assert.deepEqual(parseClientLogAmountFields({ isPtp: true, newDate: "not-a-date", newAmount: "10" }), {
    error: "Please enter a valid PTP date."
  });
  assert.deepEqual(parseClientLogAmountFields({ isCollection: true, collectionDate: manilaDateKey(), collectionAmount: "-5" }), {
    error: "Please enter a valid collection amount."
  });
});

test("a type typed by hand lands on one canonical value", () => {
  assert.equal(normalizeClientLogType("Home visit"), "HOME_VISIT");
  assert.equal(normalizeClientLogType("  home-visit  "), "HOME_VISIT");
  assert.equal(normalizeClientLogType("!!!"), "");
  assert.equal(clientLogTypeLabel("HOME_VISIT"), "Home visit");
  assert.equal(clientLogTypeLabel("FOLLOW_UP"), "Follow-up", "a built-in keeps its own label");
});

test("added types join the built-ins without duplicating them", () => {
  const options = mergeClientLogTypes(["INQUIRY", "HOME_VISIT", "home visit", "SMS_BLAST"]);
  const values = options.map((option) => option.value);
  assert.equal(values.filter((value) => value === "HOME_VISIT").length, 1);
  assert.equal(values.filter((value) => value === "INQUIRY").length, 1);
  assert.deepEqual(values.slice(0, 6), ["INQUIRY", "REQUEST", "VISIT", "COMPLAINT", "FOLLOW_UP", "OTHER"]);
  assert.deepEqual(values.slice(6), ["HOME_VISIT", "SMS_BLAST"], "added types follow, in label order");
});
