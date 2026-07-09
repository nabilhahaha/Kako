/**
 * Date parsing and shelf-life maths. The Validation Engine relies on these,
 * so parsing is tolerant of the many shapes spreadsheet dates arrive in:
 * JS Date, Excel serial numbers, ISO strings, and configured locale formats.
 */
import { isValid, parse as parseFns } from 'date-fns';

/**
 * Attempt to interpret an arbitrary cell value as a calendar date.
 * @param value raw cell value
 * @param formats ordered date-fns format strings to try for string inputs
 * @returns a Date, or null when the value is not a recognisable date
 */
export function parseFlexibleDate(
  value: unknown,
  formats: string[],
): Date | null {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  if (typeof value === 'number') {
    return excelSerialToDate(value);
  }

  const str = String(value).trim();
  if (!str) return null;

  // Numeric string that is actually an Excel serial.
  if (/^\d{4,6}(\.\d+)?$/.test(str)) {
    const serial = Number(str);
    const fromSerial = excelSerialToDate(serial);
    if (fromSerial) return fromSerial;
  }

  // ISO / Date-parseable first.
  const iso = new Date(str);
  if (isValid(iso) && /\d{4}-\d{2}-\d{2}/.test(str)) return iso;

  for (const fmt of formats) {
    const parsed = parseFns(str, fmt, new Date(2000, 0, 1));
    if (isValid(parsed)) return parsed;
  }

  return isValid(iso) ? iso : null;
}

/** Excel stores dates as days since 1899-12-30 (accounting for the 1900 bug). */
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 60000) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + Math.round(serial * 86400000);
  const date = new Date(ms);
  return isValid(date) ? date : null;
}

export function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/** Today as a yyyy-MM-dd string, suitable for <input type="date"> defaults. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const DAY_MS = 86400000;

export interface ShelfLifeResult {
  /** Remaining shelf life as a percentage of total shelf life, or null. */
  remainingPct: number | null;
  totalDays: number | null;
  remainingDays: number | null;
  /** Reason a percentage could not be computed. */
  reason?: string;
}

/**
 * Compute remaining shelf life. Total shelf life is derived from an explicit
 * production date when available, otherwise from a total shelf-life-in-days
 * value. Without either, only remaining days can be reported.
 */
export function computeShelfLife(params: {
  expiry: Date | null;
  production: Date | null;
  shelfLifeDays: number | null;
  now: Date;
}): ShelfLifeResult {
  const { expiry, production, shelfLifeDays, now } = params;

  if (!expiry) {
    return { remainingPct: null, totalDays: null, remainingDays: null, reason: 'Missing expiry date' };
  }

  const remainingDays = Math.round((expiry.getTime() - now.getTime()) / DAY_MS);

  let totalDays: number | null = null;
  if (production) {
    totalDays = Math.round((expiry.getTime() - production.getTime()) / DAY_MS);
  } else if (shelfLifeDays && shelfLifeDays > 0) {
    totalDays = Math.round(shelfLifeDays);
  }

  if (!totalDays || totalDays <= 0) {
    return {
      remainingPct: null,
      totalDays,
      remainingDays,
      reason: 'Cannot derive total shelf life (need production date or total shelf-life days)',
    };
  }

  const remainingPct = Math.max(0, (remainingDays / totalDays) * 100);
  return { remainingPct, totalDays, remainingDays };
}
