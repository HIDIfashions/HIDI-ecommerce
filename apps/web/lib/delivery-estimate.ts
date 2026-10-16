/** Display a dated promise only when a courier supplied a valid future date. */
export function courierDateLabel(value: unknown, now = new Date()): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00+05:30`);
  if (!Number.isFinite(date.getTime())) return null;
  const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (isoDay !== value || value < today) return null;
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", month: "short", day: "numeric" }).format(date);
}
