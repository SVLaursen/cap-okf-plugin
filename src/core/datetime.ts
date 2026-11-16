// ISO 8601 checks for OKF dates and times. Pure module: no Date, no clock.
// JavaScript's Date accepts too much (e.g. "2026-02-30" rolls over to March), so the checks are
// written out: a regular expression for the form, then a range check for the values.

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Date "T" hh:mm, optional :ss and .fraction, then the UTC offset as Z or ±hh:mm.
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** A calendar date written as YYYY-MM-DD, such as a log.md heading (OKF v0.2 §9). */
export function isIsoDate(value: string): boolean {
  const match = DATE.exec(value);
  if (match === null) return false;
  const [, year, month, day] = match;
  return isCalendarDate(Number(year), Number(month), Number(day));
}

/**
 * An ISO 8601 date and time with an explicit UTC offset, as OKF v0.2 §5 requires for every
 * timestamp: generated.at, verified[].at, stale_after.
 * Not accepted, to keep one written form: offsets without a colon (+0200), comma fractions.
 */
export function isIsoDateTime(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = DATE_TIME.exec(value);
  if (match === null) return false;
  // Groups left out of the text (seconds, the offset after Z) are undefined; "0" is in range.
  const [, year, month, day, hour, minute, second = "0", offsetHour = "0", offsetMinute = "0"] =
    match;
  return (
    isCalendarDate(Number(year), Number(month), Number(day)) &&
    isClockTime(Number(hour), Number(minute), Number(second)) &&
    isClockTime(Number(offsetHour), Number(offsetMinute), 0)
  );
}

function isClockTime(hour: number, minute: number, second: number): boolean {
  return hour < 24 && minute < 60 && second < 60;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  const days = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return days !== undefined && day >= 1 && day <= days;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
