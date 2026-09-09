// Shared parsing for the promise-to-pay and collection fields on a client log, so the create
// route and the admin edit route cannot drift into validating them differently.

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

// Returns the parsed fields, or an error message ready to hand back to the form.
export function parseClientLogAmountFields(payload: unknown): { error: string } | ClientLogAmountFields {
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

  return { isPtp, newDate, newAmount, collectionDate, collectionAmount };
}
