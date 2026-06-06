import { describe, it, expect, beforeAll } from 'vitest';
import { gotrueSession, gotrueUser, verifyBearer } from './gateway';
import { mintToken } from './jwt';
import type { OfflineSession } from './auth';

const SECRET = 'gateway-test-secret-at-least-32-bytes-long-xxxxx';

const session: OfflineSession = {
  token: mintToken(SECRET, { sub: 'u-1', company_id: 'co-1', email: 'a@b.c' }),
  user: { id: 'u-1', email: 'a@b.c', companyId: 'co-1', fullName: 'Admin' },
};

describe('offline gateway (GoTrue shaping + bearer verify)', () => {
  beforeAll(() => { process.env.KAKO_OFFLINE_JWT_SECRET = SECRET; });

  it('gotrueSession has the shape supabase-js expects', () => {
    const s = gotrueSession(session, 1_700_000_000);
    expect(s.token_type).toBe('bearer');
    expect(s.access_token).toBe(session.token);
    expect(s.refresh_token).toBe(session.token);
    expect(s.expires_at).toBe(1_700_000_000 + 12 * 3600);
    expect(s.user.id).toBe('u-1');
    expect(s.user.role).toBe('authenticated');
    expect(s.user.aud).toBe('authenticated');
    expect(s.user.app_metadata.company_id).toBe('co-1');
  });

  it('gotrueUser carries identity + offline provider', () => {
    const u = gotrueUser(session);
    expect(u.email).toBe('a@b.c');
    expect(u.app_metadata.provider).toBe('offline');
    expect(u.user_metadata.full_name).toBe('Admin');
  });

  it('verifyBearer accepts a valid token and rejects junk', () => {
    expect(verifyBearer(`Bearer ${session.token}`)?.sub).toBe('u-1');
    expect(verifyBearer(null)).toBeNull();
    expect(verifyBearer('Bearer not-a-token')).toBeNull();
    expect(verifyBearer('Basic abc')).toBeNull();
  });
});
