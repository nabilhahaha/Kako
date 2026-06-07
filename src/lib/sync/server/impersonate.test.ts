import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { mintReconcileToken, RECONCILE_TOKEN_TTL_SECONDS, RECONCILE_TOKEN_PURPOSE } from './impersonate';

const SECRET = 'test-jwt-secret-please-rotate';
const USER = '11111111-1111-4111-8111-111111111111';

function decode(token: string) {
  const [h, p, s] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(p, 'base64url').toString()),
    signature: s, signingInput: `${h}.${p}`,
  };
}

describe('mintReconcileToken (hardened impersonation)', () => {
  it('mints a well-formed HS256 JWT for the given user', () => {
    const { token } = mintReconcileToken(USER, { secret: SECRET, now: 1_000, jti: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    const { header, payload } = decode(token);
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(payload.sub).toBe(USER);
    expect(payload.role).toBe('authenticated');
    expect(payload.aud).toBe('authenticated');
    expect(payload.iss).toBe('kako-reconcile');
    expect(payload.purpose).toBe(RECONCILE_TOKEN_PURPOSE);
  });

  it('is short-lived: exp = iat + 60s, with an nbf skew allowance', () => {
    const now = 10_000;
    const { payload } = decode(mintReconcileToken(USER, { secret: SECRET, now }).token);
    expect(payload.iat).toBe(now);
    expect(payload.exp - payload.iat).toBe(RECONCILE_TOKEN_TTL_SECONDS);
    expect(RECONCILE_TOKEN_TTL_SECONDS).toBeLessThanOrEqual(60);
    expect(payload.nbf).toBeLessThanOrEqual(payload.iat);
  });

  it('rotates: each mint has a unique jti (no reuse)', () => {
    const a = mintReconcileToken(USER, { secret: SECRET });
    const b = mintReconcileToken(USER, { secret: SECRET });
    expect(a.jti).not.toBe(b.jti);
    expect(a.token).not.toBe(b.token);
  });

  it('signature verifies with the secret and fails with a wrong/rotated secret', () => {
    const { token } = mintReconcileToken(USER, { secret: SECRET, now: 1_000, jti: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    const { signingInput, signature } = decode(token);
    const good = crypto.createHmac('sha256', SECRET).update(signingInput).digest('base64url');
    const bad = crypto.createHmac('sha256', 'rotated-secret').update(signingInput).digest('base64url');
    expect(signature).toBe(good);     // verifies under the minting secret
    expect(signature).not.toBe(bad);  // a rotated/wrong secret rejects it
  });

  it('expiry is enforceable: a token minted in the past is already expired vs now', () => {
    const pastNow = Math.floor(Date.now() / 1000) - 3600;
    const { payload } = decode(mintReconcileToken(USER, { secret: SECRET, now: pastNow }).token);
    expect(payload.exp).toBeLessThan(Math.floor(Date.now() / 1000)); // PostgREST would reject (JWT expired)
  });

  it('fails closed when the signing secret is absent', () => {
    const prev = process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;
    try {
      expect(() => mintReconcileToken(USER)).toThrow(/SUPABASE_JWT_SECRET/);
    } finally {
      if (prev !== undefined) process.env.SUPABASE_JWT_SECRET = prev;
    }
  });

  it('metadata matches the token claims (for the audit row)', () => {
    const m = mintReconcileToken(USER, { secret: SECRET, now: 5_000, jti: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    const { payload } = decode(m.token);
    expect(m.jti).toBe(payload.jti);
    expect(m.sub).toBe(payload.sub);
    expect(m.issuedAt).toBe(payload.iat);
    expect(m.expiresAt).toBe(payload.exp);
  });
});
