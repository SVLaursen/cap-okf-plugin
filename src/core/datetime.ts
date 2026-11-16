// ISO 8601 checks for OKF dates and times. Pure module: no Date, no clock.
// JavaScript's Date accepts too much (e.g. "2026-02-30" rolls over to March), so the checks are
// written out: a regular expression for the form, then a calendar check for the values.

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Date "T" hours:minutes, optional :seconds and .fraction, optional Z or ±hh:mm offset.
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** A calendar date written as YYYY-MM-DD, such as a log.md heading (OKF v0.2 §9). */
export function isIsoDate(value: string): boolean {
  const match = DATE.exec(value);
  if (match === null) return false;
  const [, year, month, day] = match;
  return isCalendarDate(Number(year), Number(month), Number(day));
}

/**
 * An ISO 8601 date and time, such as generated.at (OKF v0.2 §5.2).
 * With `requireZone`, it must also be an absolute instant (Z or an offset), as stale_after (§5.5).
 */
export function isIsoDateTime(value: unknown, options: { requireZone: boolean }): boolean {
  if (typeof value !== "string") return false;
  const match = DATE_TIME.exec(value);
  if (match === null) return false;
  const [, year, month, day, hour, minute, second = "0", zone] = match;
  if (options.requireZone && zone === undefined) return false;
  const isTime = Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60;
  return isTime && isCalendarDate(Number(year), Number(month), Number(day));
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  const days = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return days !== undefined && day >= 1 && day <= days;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
