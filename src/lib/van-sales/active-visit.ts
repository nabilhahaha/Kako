// Active-visit marker — records the customer whose visit is currently OPEN so the
// app can offer "Resume Current Visit" on launch. Unlike visit-session (per-action
// unfinished work in sessionStorage), this is a single localStorage record that
// SURVIVES an app restart. Set when a visit context opens; cleared on Complete /
// Discard Visit. Client-only; best-effort (storage may be unavailable). Pure-ish.

export interface ActiveVisit {
  customerId: string;
  name: string;
  startedAt: number;
}

const KEY = 'kako.activevisit';

export function setActiveVisit(customerId: string, name: string): void {
  if (typeof window === 'undefined' || !customerId) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ customerId, name, startedAt: Date.now() } satisfies ActiveVisit));
  } catch {
    /* storage unavailable — resume is best-effort */
  }
}

export function getActiveVisit(): ActiveVisit | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ActiveVisit;
    return v && typeof v.customerId === 'string' && v.customerId ? v : null;
  } catch {
    return null;
  }
}

export function clearActiveVisit(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
