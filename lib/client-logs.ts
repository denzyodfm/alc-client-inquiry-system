// Shared parsing for the promise-to-pay and collection fields on a client log, so the create
// route and the admin edit route cannot drift into validating them differently.

import { manilaDateKey } from "@/lib/location-loan-aging";

export type ClientLogAmountFields = {
  isPtp: boolean;
  newDate: Date | null;
  newAmount: number | null;
  collectionDate: Date | null;
  collectionAmount: number | null;
};

function parseDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return new Date(`${text}T00:00:00.000Z`);
}

function parseAmount(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return Number(text);
}

function invalidDate(value: Date | null) {
  return value !== null && Number.isNaN(value.getTime());
}

function invalidAmount(value: number | null) {
  return value !== null && (!Number.isFinite(value) || value < 0);
}

// Returns the parsed fields, or an error message ready to hand back to the form. An edit passes
// the date already on the log, so one whose PTP has since come and gone can still be corrected.
export function parseClientLogAmountFields(
  payload: unknown,
  options: { previousNewDate?: Date | null } = {}
): { error: string } | ClientLogAmountFields {
  const body = (payload ?? {}) as Record<string, unknown>;
  const isPtp = Boolean(body.isPtp);
  const newDate = parseDate(body.newDate);
  const newAmount = parseAmount(body.newAmount);
  // A ticked box with nothing in it would save a log that claims a promise or a collection and
  // holds no figure for it, which is worse than an untidy form.
  const isCollection = Boolean(body.isCollection);
  const collectionDate = isCollection ? parseDate(body.collectionDate) : null;
  const collectionAmount = isCollection ? parseAmount(body.collectionAmount) : null;

  if (invalidDate(newDate)) return { error: isPtp ? "Please enter a valid PTP date." : "Please enter a valid new date." };
  if (invalidAmount(newAmount)) return { error: isPtp ? "Please enter a valid PTP amount." : "Please enter a valid new amount." };
  if (invalidDate(collectionDate)) return { error: "Please enter a valid collection date." };
  if (invalidAmount(collectionAmount)) return { error: "Please enter a valid collection amount." };
  if (isPtp && (!newDate || newAmount === null)) return { error: "Promise to pay needs both a PTP date and a PTP amount." };
  if (isCollection && (!collectionDate || collectionAmount === null)) {
    return { error: "Collection needs both a collection date and a collection amount." };
  }
  // A collection records money already handed over, so its date is when it was received.
  // Dating one ahead would be a schedule, and only the PTP date puts a client on the officer's
  // calendar - a collection never does.
  if (collectionDate && manilaDateKey(collectionDate) > manilaDateKey()) {
    return { error: "A collection date cannot be in the future. Use the PTP date to schedule a follow-up." };
  }
  // A promise to pay is a day still to come, so it is today at the earliest. The date a log was
  // already saved with is left alone: its day passing is not a reason to refuse an edit to the
  // notes, and moving it is what the schedule is for.
  if (newDate && manilaDateKey(newDate) < manilaDateKey()
    && !(options.previousNewDate && manilaDateKey(options.previousNewDate) === manilaDateKey(newDate))) {
    return { error: isPtp ? "A PTP date cannot be in the past. Choose today or a later date." : "A new date cannot be in the past. Choose today or a later date." };
  }

  return { isPtp, newDate, newAmount, collectionDate, collectionAmount };
}
