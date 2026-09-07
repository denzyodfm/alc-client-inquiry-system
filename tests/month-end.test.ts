import test from "node:test";
import assert from "node:assert/strict";
import { monthEnd } from "../lib/monthly-portfolio";

// Months are not all 31 days, and February is not always 28. The monthly capture refuses to
// run except on a month's last day, so if this arithmetic is wrong the report either never
// captures that month or captures it on the wrong day - and a month captured on the wrong day
// carries figures that do not belong to it.

const day = (year: number, month: number, date: number) => new Date(Date.UTC(year, month - 1, date));

test("monthEnd finds the real last day of every month length", () => {
  const cases: Array<[number, number, number]> = [
    [2026, 1, 31],  // 31
    [2026, 2, 28],  // common year
    [2026, 3, 31],
    [2026, 4, 30],  // 30
    [2026, 5, 31],
    [2026, 6, 30],
    [2026, 7, 31],
    [2026, 8, 31],
    [2026, 9, 30],  // 30 - the month this report first captures
    [2026, 10, 31],
    [2026, 11, 30],
    [2026, 12, 31]
  ];
  for (const [year, month, expected] of cases) {
    assert.equal(monthEnd(day(year, month, 1)).getUTCDate(), expected, `${year}-${month} from the 1st`);
    assert.equal(monthEnd(day(year, month, 15)).getUTCDate(), expected, `${year}-${month} from mid-month`);
    assert.equal(monthEnd(day(year, month, expected)).getUTCDate(), expected, `${year}-${month} from its own last day`);
    assert.equal(monthEnd(day(year, month, 1)).getUTCMonth(), month - 1, `${year}-${month} stays in its own month`);
  }
});

test("February is 29 days in a leap year and 28 otherwise", () => {
  assert.equal(monthEnd(day(2024, 2, 10)).getUTCDate(), 29, "2024 is a leap year");
  assert.equal(monthEnd(day(2028, 2, 10)).getUTCDate(), 29, "2028 is a leap year");
  assert.equal(monthEnd(day(2025, 2, 10)).getUTCDate(), 28, "2025 is not");
  assert.equal(monthEnd(day(2026, 2, 10)).getUTCDate(), 28, "2026 is not");
  assert.equal(monthEnd(day(2027, 2, 10)).getUTCDate(), 28, "2027 is not");
  // The hundred-year rule: 2100 is divisible by four but is not a leap year.
  assert.equal(monthEnd(day(2100, 2, 10)).getUTCDate(), 28, "2100 is divisible by 4 but not a leap year");
  assert.equal(monthEnd(day(2000, 2, 10)).getUTCDate(), 29, "2000 is divisible by 400 and is a leap year");
});

test("the capture guard admits exactly one day per month", () => {
  // Mirrors scripts/capture-month.ts: today is a month end only when its date equals the last.
  const isLastDay = (d: Date) => d.getUTCDate() === monthEnd(d).getUTCDate();
  for (const [year, month] of [[2026, 2], [2026, 4], [2026, 9], [2026, 12], [2024, 2]] as Array<[number, number]>) {
    const last = monthEnd(day(year, month, 1)).getUTCDate();
    let admitted = 0;
    for (let date = 1; date <= last; date++) {
      if (isLastDay(day(year, month, date))) admitted++;
    }
    assert.equal(admitted, 1, `${year}-${month} should admit exactly one day, admitted ${admitted}`);
    assert.ok(isLastDay(day(year, month, last)), `${year}-${month} must admit its own last day (${last})`);
    assert.ok(!isLastDay(day(year, month, last - 1)), `${year}-${month} must not admit the day before`);
  }
});
