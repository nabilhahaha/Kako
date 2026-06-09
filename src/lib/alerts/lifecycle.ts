// Critical Alerts Framework — PURE alert lifecycle transitions. open → acknowledged
// → resolved, with snooze (open/acknowledged → snoozed → open when the timer
// passes) and resolve from any non-terminal state. No I/O; the server actions and
// the evaluator apply these rules.

import type { AlertStatus } from './types';

const TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  open:         ['acknowledged', 'snoozed', 'resolved'],
  acknowledged: ['snoozed', 'resolved'],
  snoozed:      ['open', 'acknowledged', 'resolved'],
  resolved:     [],   // terminal (the evaluator may re-open by raising a fresh alert)
};

/** Is `to` a legal next status from `from`? */
export function canTransitionAlert(from: AlertStatus, to: AlertStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** A snoozed alert whose timer has passed should return to `open`. Pure. */
export function snoozeExpired(snoozedUntilMs: number | null, nowMs: number): boolean {
  return snoozedUntilMs != null && snoozedUntilMs <= nowMs;
}

/** Clamp a requested snooze duration to a sane window (1h..30d). */
export function clampSnoozeHours(hours: number, fallback: number): number {
  const h = Number.isFinite(hours) && hours > 0 ? hours : fallback;
  return Math.min(Math.max(h, 1), 24 * 30);
}
