// Client-only per-visit counters (clicks + screen transitions + duration) for the
// Smart Next Customer pilot telemetry. Kept in sessionStorage so it spans in-visit
// navigation (statement → sell → statement …). Flushed into the visit_completed
// event. Best-effort; no effect on the user flow. Pure-ish (guarded for SSR).

interface VisitMetrics {
  customerId: string;
  startedAt: number;
  clicks: number;
  transitions: number;
}

const KEY = 'kako.visitmetrics';

function read(): VisitMetrics | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VisitMetrics) : null;
  } catch {
    return null;
  }
}

function write(v: VisitMetrics | null) {
  if (typeof window === 'undefined') return;
  try {
    if (v) window.sessionStorage.setItem(KEY, JSON.stringify(v));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

/**
 * Note that the visit hub opened for a customer. Returns 'started' for a new
 * visit (counters reset) or 'continued' for a re-entry (transitions++). Used to
 * emit visit_started once and to count screen transitions during the visit.
 */
export function noteVisitOpen(customerId: string): 'started' | 'continued' {
  if (!customerId) return 'continued';
  const cur = read();
  if (cur && cur.customerId === customerId) {
    write({ ...cur, transitions: cur.transitions + 1 });
    return 'continued';
  }
  write({ customerId, startedAt: Date.now(), clicks: 0, transitions: 1 });
  return 'started';
}

/** Count a meaningful in-visit action tap (Collect / Sell / Return / Navigate …). */
export function noteVisitClick() {
  const cur = read();
  if (cur) write({ ...cur, clicks: cur.clicks + 1 });
}

/** End the current visit and return its metrics (clears the counter). */
export function endVisitMetrics(): { durationMs: number; clicks: number; transitions: number } | null {
  const cur = read();
  if (!cur) return null;
  write(null);
  return { durationMs: Math.max(0, Date.now() - cur.startedAt), clicks: cur.clicks, transitions: cur.transitions };
}
