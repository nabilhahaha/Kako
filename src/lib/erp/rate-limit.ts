/** ── Minimal in-memory rolling-window rate limiter ─────────────────────────
 *  A tiny, dependency-free limiter for routes/middleware that have no per-key
 *  DB log to count against (unlike /api/v1, which rate-limits by counting rows
 *  in erp_integration_logs). Keeps a rolling window of hit timestamps per key
 *  in a module-level Map.
 *
 *  SCOPE / LIMITATION: state lives in the process (or edge isolate) memory, so
 *  it is per-instance and best-effort — it is NOT shared across serverless
 *  instances/regions. It meaningfully throttles bursts from a single client
 *  hitting one instance, but a distributed/global guarantee needs shared infra
 *  (Upstash/Redis). Good enough as defense-in-depth for export + auth bursts;
 *  the real authorization gate remains RLS + the route's own auth checks. */

interface Bucket {
  hits: number[]; // sorted-ish timestamps (ms) within the window
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/** Drop empty/expired buckets occasionally so the Map can't grow unbounded. */
function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  const cutoff = now - windowMs;
  for (const [key, b] of buckets) {
    const live = b.hits.filter((t) => t > cutoff);
    if (live.length === 0) buckets.delete(key);
    else b.hits = live;
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds the caller should wait before retrying (for Retry-After). */
  retryAfter: number;
  remaining: number;
}

/**
 * Record a hit for `key` and report whether it is within `limit` per
 * `windowMs`. Counts the current call against the window.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);
  const cutoff = now - windowMs;

  const bucket = buckets.get(key) ?? { hits: [] };
  const live = bucket.hits.filter((t) => t > cutoff);

  if (live.length >= limit) {
    const oldest = live[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    bucket.hits = live;
    buckets.set(key, bucket);
    return { ok: false, retryAfter, remaining: 0 };
  }

  live.push(now);
  bucket.hits = live;
  buckets.set(key, bucket);
  return { ok: true, retryAfter: 0, remaining: Math.max(0, limit - live.length) };
}

/** Best-effort client IP from common proxy headers (Vercel/Cloudflare). */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}
