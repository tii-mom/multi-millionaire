import { formatNumber } from "@/src/lib/i18n";

export function formatInteger(value: string | number | null | undefined, locale: string) {
  const text = String(value ?? "0");
  if (!/^\d+$/.test(text)) return text;
  return formatNumber(text, locale, { maximumFractionDigits: 0 });
}

export function formatDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
