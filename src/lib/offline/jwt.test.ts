import { describe, it, expect } from 'vitest';
import { mintToken, verifyToken } from './jwt';

const SECRET = 'test-local-secret-which-is-at-least-32-bytes-long!!';

describe('offline jwt (HS256, Supabase-shaped)', () => {
  it('mints a token that round-trips and carries Supabase claims', () => {
    const now = 1_700_000_000;
    const token = mintToken(SECRET, { sub: '11111111-1111-1111-1111-111111111111', company_id: 'c1', email: 'a@b.c' }, 3600, now);
    const res = verifyToken(SECRET, token, now + 10);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.claims.sub).toBe('11111111-1111-1111-1111-111111111111');
    expect(res.claims.role).toBe('authenticated');
    expect(res.claims.aud).toBe('authenticated');
    expect(res.claims.company_id).toBe('c1');
    expect(res.claims.iat).toBe(now);
    expect(res.claims.exp).toBe(now + 3600);
  });

  it('rejects a tampered payload (bad signature)', () => {
    const token = mintToken(SECRET, { sub: 'u1' });
    const [h, , s] = token.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'attacker', role: 'authenticated' })).toString('base64url')}.${s}`;
    expect(verifyToken(SECRET, forged).ok).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = mintToken(SECRET, { sub: 'u1' });
    const res = verifyToken('a-totally-different-secret-value-here-1234', token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('bad-signature');
  });

  it('rejects an expired token', () => {
    const now = 1_700_000_000;
    const token = mintToken(SECRET, { sub: 'u1' }, 60, now);
    const res = verifyToken(SECRET, token, now + 120);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('expired');
  });

  it('rejects malformed input', () => {
    expect(verifyToken(SECRET, 'not-a-jwt').ok).toBe(false);
    expect(verifyToken(SECRET, 'a.b').ok).toBe(false);
  });
});
