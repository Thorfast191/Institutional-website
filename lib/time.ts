// HTML date and time inputs submit strings; the matching Prisma columns are
// DateTime / @db.Time / @db.Date. Every conversion here pins UTC explicitly —
// parsing "09:30" or "2026-08-15" with a local-time constructor shifts the
// stored value for anyone outside UTC, and the bug is invisible in a UTC
// developer environment. The Phase 1 seed already writes times as
// new Date("1970-01-01T09:00:00Z"), which this matches.

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseTimeInput(value: string): Date {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid time input: ${value}`);
  }
  return new Date(`1970-01-01T${match[1]}:${match[2]}:00Z`);
}

export function formatTimeInput(value: Date): string {
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function parseDateInput(value: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`Invalid date input: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date input: ${value}`);
  }
  return parsed;
}

export function formatDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}
