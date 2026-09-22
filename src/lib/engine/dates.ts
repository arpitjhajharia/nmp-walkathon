// Date helpers. All competition dates are plain YYYY-MM-DD strings interpreted in the
// season's configured timezone; arithmetic is done in UTC so DST never shifts a day.

export type ISODate = string;

const DAY_MS = 86_400_000;

export function parseISO(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function toISO(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return toISO(new Date(parseISO(d).getTime() + n * DAY_MS));
}

/** Whole days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday */
export function weekday(d: ISODate): number {
  return (parseISO(d).getUTCDay() + 6) % 7;
}

export function mondayOf(d: ISODate): ISODate {
  return addDays(d, -weekday(d));
}

export function dateRange(start: ISODate, count: number): ISODate[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function isValidISODate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && toISO(parseISO(d)) === d;
}

/** Current date and time in the given IANA timezone. */
export function nowInTz(timezone: string, now: Date = new Date()): { date: ISODate; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), minute: Number(get("minute")) };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function weekdayShort(d: ISODate): string {
  return WEEKDAYS[weekday(d)];
}

/** "Mon 22 Sep" */
export function formatDay(d: ISODate): string {
  const dt = parseISO(d);
  return `${WEEKDAYS[weekday(d)]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}

/** "22 Sep" */
export function formatShort(d: ISODate): string {
  const dt = parseISO(d);
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}

/** "15–21 Sep" or "29 Sep – 5 Oct" */
export function formatRange(a: ISODate, b: ISODate): string {
  const da = parseISO(a);
  const db = parseISO(b);
  if (a === b) return formatShort(a);
  if (da.getUTCMonth() === db.getUTCMonth()) return `${da.getUTCDate()}–${db.getUTCDate()} ${MONTHS[db.getUTCMonth()]}`;
  return `${formatShort(a)} – ${formatShort(b)}`;
}

export function monthName(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}
