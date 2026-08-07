const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const dateOnlyFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric"
});

export function money(value: unknown) {
  const amount = Number(value ?? 0);
  if (!amount) return "-";
  return moneyFormatter.format(amount);
}

export function dateTime(value?: Date | string | null) {
  if (!value) return "Not yet";
  return dateTimeFormatter.format(new Date(value));
}

export function dateOnly(value?: Date | string | null) {
  if (!value) return "-";
  return dateOnlyFormatter.format(new Date(value));
}
