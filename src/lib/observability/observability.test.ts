import { describe, it, expect } from 'vitest';
import { formatLogLine, redact } from './log';
import { buildAlertPayload } from './alert';

describe('observability/log', () => {
  it('formatLogLine emits structured JSON with level + msg + ts + context', () => {
    const line = formatLogLine('info', 'hello', { a: 1, route: '/x' }, '2026-06-08T00:00:00.000Z');
    const o = JSON.parse(line);
    expect(o).toMatchObject({ ts: '2026-06-08T00:00:00.000Z', level: 'info', msg: 'hello', a: 1, route: '/x' });
  });

  it('redact masks sensitive keys at any depth, preserves the rest', () => {
    const out = redact({
      authorization: 'Bearer xyz',
      nested: { token: 'abc', keep: 'ok', api_key: 'k' },
      list: [{ password: 'p' }, { fine: 1 }],
    }) as Record<string, unknown>;
    expect(out.authorization).toBe('[redacted]');
    const nested = out.nested as Record<string, unknown>;
    expect(nested.token).toBe('[redacted]');
    expect(nested.api_key).toBe('[redacted]');
    expect(nested.keep).toBe('ok');
    expect((out.list as Record<string, unknown>[])[0].password).toBe('[redacted]');
    expect((out.list as Record<string, unknown>[])[1].fine).toBe(1);
  });
});

describe('observability/alert', () => {
  it('buildAlertPayload is structured + redacts context', () => {
    const p = buildAlertPayload('x.failed', 'critical', { error: 'boom', secret: 's' }, '2026-06-08T00:00:00.000Z');
    expect(p).toMatchObject({ ts: '2026-06-08T00:00:00.000Z', severity: 'critical', event: 'x.failed' });
    expect(p.context.error).toBe('boom');
    expect(p.context.secret).toBe('[redacted]');
  });
});
