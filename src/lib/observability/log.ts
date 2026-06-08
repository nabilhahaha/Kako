// ============================================================================
// Structured logging (Step 2 hardening). Emits one JSON line per event to
// stdout/stderr (captured by the platform's log pipeline) with level + message +
// timestamp + arbitrary context. Dependency-free. Secrets are redacted. Level is
// filtered by LOG_LEVEL (default 'info'). The pure formatter is unit-tested.
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Keys whose values are redacted wherever they appear in context. */
const SENSITIVE = /^(authorization|password|passwd|secret|token|api[_-]?key|cookie|set-cookie|access[_-]?token|refresh[_-]?token|service[_-]?role|anon[_-]?key)$/i;

/** Recursively redact sensitive values. Pure. Caps depth to avoid pathological input. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** The configured minimum level (LOG_LEVEL env), default 'info'. */
export function configuredLevel(): LogLevel {
  const v = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return (['debug', 'info', 'warn', 'error'] as LogLevel[]).includes(v as LogLevel) ? (v as LogLevel) : 'info';
}

/** Build a single structured JSON log line. Pure (timestamp injectable for tests). */
export function formatLogLine(level: LogLevel, msg: string, ctx?: LogContext, ts = new Date().toISOString()): string {
  const base: Record<string, unknown> = { ts, level, msg };
  if (ctx) Object.assign(base, redact(ctx) as Record<string, unknown>);
  return JSON.stringify(base);
}

function emit(level: LogLevel, msg: string, ctx?: LogContext): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[configuredLevel()]) return;
  const line = formatLogLine(level, msg, ctx);
  // eslint-disable-next-line no-console
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

export const log = {
  debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
};
