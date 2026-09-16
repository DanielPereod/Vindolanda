/** Returns the ISO calendar date in an explicit IANA timezone. */
export function localDate(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
/** Date-only tasks stay current for their entire local day. */
export function isOverdue(
  date: string | null,
  time: string | null,
  timezone: string,
  now = new Date(),
): boolean {
  if (!date) return false;
  const today = localDate(timezone, now);
  if (date !== today) return date < today;
  if (!time) return false;
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return time.slice(0, 5) < clock;
}
export function formatDate(date: string, format = "DD/MM/YYYY"): string {
  if (format === "YYYY-MM-DD") return date;
  return date.split("-").reverse().join("/");
}

/** Formats a local clock without converting it through the browser timezone. */
export function formatTime(time: string, hourFormat: "12" | "24"): string {
  if (hourFormat === "24") return time.slice(0, 5);
  const hours = Number(time.slice(0, 2));
  return `${hours % 12 || 12}:${time.slice(3, 5)} ${hours < 12 ? "a. m." : "p. m."}`;
}
