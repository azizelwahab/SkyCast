// Dates from Open-Meteo are already in the place's local time ("2026-01-16T14:00").
// We treat them as plain calendar values and never convert through the browser's time zone.
export function parseLocalDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(iso, options, locale) {
  const date = parseLocalDate(iso);
  return date ? date.toLocaleDateString(locale, { ...options, timeZone: "UTC" }) : "";
}

export function addDays(iso, n) {
  const date = parseLocalDate(iso);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

export const hhmm = (iso) => String(iso).slice(11, 16);

export function hour12(h) {
  return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
