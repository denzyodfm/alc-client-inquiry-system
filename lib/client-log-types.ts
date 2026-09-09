// The log types shipped with the app. The column is a free VarChar rather than an enum, so an
// office can add its own type from the entry form; anything already saved comes back through
// mergeClientLogTypes and joins the dropdown for everyone from then on.
export const BASE_CLIENT_LOG_TYPES = [
  { value: "INQUIRY", label: "Inquiry" },
  { value: "REQUEST", label: "Request" },
  { value: "VISIT", label: "Branch Visit" },
  { value: "COMPLAINT", label: "Complaint" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "OTHER", label: "Other" }
] as const;

export type ClientLogTypeOption = { value: string; label: string };

// "Home visit" and "home-visit" are the same type; without this the dropdown fills up with
// near-duplicates that then have to be reconciled in every report.
export function normalizeClientLogType(input: string) {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export function clientLogTypeLabel(value: string) {
  const known = BASE_CLIENT_LOG_TYPES.find((option) => option.value === value);
  if (known) return known.label;
  const words = value.replace(/_/g, " ").trim().toLocaleLowerCase("en");
  return words ? words.charAt(0).toLocaleUpperCase("en") + words.slice(1) : value;
}

// Built-ins first in their curated order, then whatever the branches have added, alphabetically.
export function mergeClientLogTypes(existing: readonly string[]): ClientLogTypeOption[] {
  const base: ClientLogTypeOption[] = BASE_CLIENT_LOG_TYPES.map((option) => ({ value: option.value, label: option.label }));
  const seen = new Set(base.map((option) => option.value));
  const extras: ClientLogTypeOption[] = [];
  for (const raw of existing) {
    const value = normalizeClientLogType(String(raw ?? ""));
    if (!value || seen.has(value)) continue;
    seen.add(value);
    extras.push({ value, label: clientLogTypeLabel(value) });
  }
  extras.sort((a, b) => a.label.localeCompare(b.label));
  return [...base, ...extras];
}
