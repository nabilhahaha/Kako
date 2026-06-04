import { describe, it, expect } from 'vitest';
import { signOauth1, rfc3986 } from './oauth1';

describe('oauth1 — RFC-3986 encoding', () => {
  it('encodes the reserved sub-delims that encodeURIComponent leaves', () => {
    expect(rfc3986("a!*'()b")).toBe('a%21%2A%27%28%29b');
    expect(rfc3986('a b')).toBe('a%20b');
    expect(rfc3986('A-Z.0_9~')).toBe('A-Z.0_9~'); // unreserved unchanged
  });
});

describe('oauth1 — TBA signature (known vector)', () => {
  // Reproduced independently with node:crypto for this exact request.
  const args = {
    method: 'GET',
    url: 'https://acct123.suitetalk.api.netsuite.com/services/rest/record/v1/customer?limit=100&offset=0',
    consumerKey: 'ck', consumerSecret: 'cs', tokenId: 'tok', tokenSecret: 'ts',
    realm: '123456', nonce: 'nonce123', timestamp: '1700000000',
  };

  it('builds the expected signature base string and HMAC-SHA256 signature', () => {
    const r = signOauth1(args);
    expect(r.baseString).toBe(
      'GET&https%3A%2F%2Facct123.suitetalk.api.netsuite.com%2Fservices%2Frest%2Frecord%2Fv1%2Fcustomer&limit%3D100%26oauth_consumer_key%3Dck%26oauth_nonce%3Dnonce123%26oauth_signature_method%3DHMAC-SHA256%26oauth_timestamp%3D1700000000%26oauth_token%3Dtok%26oauth_version%3D1.0%26offset%3D0',
    );
    expect(r.signature).toBe('DSwMDne7Zlw4HCr8b2+SYuyuCMwBPpPrcN9ber8b61I=');
  });

  it('emits an Authorization: OAuth header with realm + signature (percent-encoded)', () => {
    const { header } = signOauth1(args);
    expect(header.startsWith('OAuth ')).toBe(true);
    expect(header).toContain('realm="123456"');
    expect(header).toContain('oauth_consumer_key="ck"');
    expect(header).toContain('oauth_signature_method="HMAC-SHA256"');
    expect(header).toContain('oauth_signature="DSwMDne7Zlw4HCr8b2%2BSYuyuCMwBPpPrcN9ber8b61I%3D"');
  });

  it('a different token secret changes the signature', () => {
    const a = signOauth1(args);
    const b = signOauth1({ ...args, tokenSecret: 'different' });
    expect(a.signature).not.toBe(b.signature);
  });
});
