import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string | null | undefined, currency = 'SAR') {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat('ar-SA').format(Number(value ?? 0));
}

export function initialsFromEmail(email: string | null | undefined) {
  if (!email) return '?';
  const name = email.split('@')[0];
  return name.slice(0, 2).toUpperCase();
}
