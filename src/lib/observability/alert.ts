// ============================================================================
// Alerting (Step 2 hardening). A thin, dependency-free alert sink: every alert is
// emitted as a structured log line AND — if ALERT_WEBHOOK_URL is configured —
// POSTed to that webhook (best-effort, never throws, fire-and-forget). With no
// webhook configured it degrades to the structured log only (safe default). The
// payload builder is pure + unit-tested.
// ============================================================================

import { log, redact, type LogContext } from './log';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertPayload {
  ts: string;
  severity: AlertSeverity;
  event: string;
  context: Record<string, unknown>;
}

/** Build the webhook payload. Pure (timestamp injectable for tests). */
export function buildAlertPayload(event: string, severity: AlertSeverity, ctx?: LogContext, ts = new Date().toISOString()): AlertPayload {
  return { ts, severity, event, context: (ctx ? (redact(ctx) as Record<string, unknown>) : {}) };
}

/**
 * Raise an alert. Always logs (warn for warning, error for critical, info else);
 * additionally POSTs to ALERT_WEBHOOK_URL when set. Best-effort: a webhook failure
 * is swallowed (never breaks the calling path).
 */
export async function alert(event: string, severity: AlertSeverity = 'warning', ctx?: LogContext): Promise<void> {
  const payload = buildAlertPayload(event, severity, ctx);
  if (severity === 'critical') log.error(`alert:${event}`, { severity, ...ctx });
  else if (severity === 'warning') log.warn(`alert:${event}`, { severity, ...ctx });
  else log.info(`alert:${event}`, { severity, ...ctx });

  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort: never let alerting break the caller.
  }
}
