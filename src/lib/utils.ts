import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency = 'EGP',
  locale = 'ar-EG',
) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatNumber(
  value: number | string | null | undefined,
  locale = 'ar-EG',
) {
  return new Intl.NumberFormat(locale).format(Number(value ?? 0));
}

export function formatDate(
  value: string | Date | null | undefined,
  locale = 'ar-EG',
) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** Whole-years age from a birth date (string or Date). Returns null if absent/invalid. */
export function ageFromBirthDate(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

export function initialsFromName(name: string | null | undefined) {
  if (!name) return '؟';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Split an array into batches of at most `size` (default 100), preserving order and
 *  covering every element exactly once. Used to keep PostgREST `.in(col, ids)` filters —
 *  which are serialised into the request URL — small enough to avoid the gateway URI
 *  limit, so a single bulk action can safely span thousands of ids. `size` is clamped to
 *  ≥1. An empty input yields no batches. */
export function chunk<T>(arr: T[], size = 100): T[][] {
  const step = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += step) out.push(arr.slice(i, i + step));
  return out;
}
