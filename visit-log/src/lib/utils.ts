import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, isToday, isYesterday } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDay(iso: string) {
  const date = new Date(iso)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'd MMMM yyyy')
}

export function formatDate(iso: string) {
  return format(new Date(iso), 'd MMM yyyy')
}

export function formatTime(iso: string) {
  return format(new Date(iso), 'h:mm a')
}

export function formatDateTime(iso: string) {
  return `${formatDay(iso)} · ${formatTime(iso)}`
}

export function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

/** datetime-local input value for an ISO timestamp, in the local timezone. */
export function toLocalInputValue(iso: string) {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm")
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** True for fetch/network-layer failures (offline), false for API errors. */
export function isNetworkError(error: unknown): boolean {
  if (!navigator.onLine) return true
  const message = error instanceof Error ? error.message : String(error)
  return /failed to fetch|network|load failed|fetch failed/i.test(message)
}
