import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateLicenseKeyPair, signPayload, verifyPayload, canonicalize } from './sign';
import { verifyLicense, hasFreeSeat } from './verify';
import { installLicense, buildActivationRequest } from './activate';
import { deviceFingerprint, fuzzyMatch } from './fingerprint';
import { saveLicense, loadLicense } from './store';
import type { LicensePayload, SignedLicense } from './types';
import { EDITIONS } from '@/lib/edition/editions';

const keys = generateLicenseKeyPair();
// Derive codes from the descriptor (the no-core-fork rule forbids edition
// literals outside lib/edition — tests included).
const RETAIL = EDITIONS.retail.productCode;
const PHARMACY = EDITIONS.pharmacy.productCode;

function makeLicense(over: Partial<LicensePayload> = {}): SignedLicense {
  const payload: LicensePayload = {
    licenseId: 'lic-1', customerId: 'cust-1', edition: 'retail', productCode: RETAIL,
    tier: 'standard', issuedAt: '2026-01-01T00:00:00Z', validUntil: null,
    maxTerminals: 1, activations: [{ deviceFingerprint: 'dev-A', activatedAt: '2026-01-01T00:00:00Z' }],
    features: {}, version: 1, ...over,
  };
  return { payload, signature: signPayload(payload, keys.privateKey) };
}

const ctx = (over = {}) => ({ publicKey: keys.publicKey, edition: 'retail', productCode: RETAIL, deviceFingerprint: 'dev-A', ...over });

describe('license signing', () => {
  it('canonicalize is order-independent', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });
  it('valid signature verifies; tampering breaks it', () => {
    const lic = makeLicense();
    expect(verifyPayload(lic.payload, lic.signature, keys.publicKey)).toBe(true);
    const tampered = { ...lic.payload, maxTerminals: 99 };
    expect(verifyPayload(tampered, lic.signature, keys.publicKey)).toBe(false);
  });
  it('a different key cannot verify', () => {
    const other = generateLicenseKeyPair();
    const lic = makeLicense();
    expect(verifyPayload(lic.payload, lic.signature, other.publicKey)).toBe(false);
  });
});

describe('license verification', () => {
  it('accepts a valid, activated, in-cap license', () => {
    const res = verifyLicense(makeLicense(), ctx());
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.seatsUsed).toBe(1); expect(res.seatsMax).toBe(1); }
  });
  it('rejects a tampered license (bad signature)', () => {
    const lic = makeLicense();
    lic.payload.maxTerminals = 5; // not re-signed
    expect(verifyLicense(lic, ctx()).ok).toBe(false);
  });
  it('rejects the wrong edition (ties license to brand)', () => {
    const res = verifyLicense(makeLicense(), ctx({ edition: 'pharmacy', productCode: PHARMACY }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('edition-mismatch');
  });
  it('rejects an expired license', () => {
    const lic = makeLicense({ validUntil: '2026-01-01T00:00:00Z' });
    const res = verifyLicense(lic, ctx({ now: new Date('2026-06-01T00:00:00Z') }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('expired');
  });
  it('rejects a device that holds no seat', () => {
    const res = verifyLicense(makeLicense(), ctx({ deviceFingerprint: 'dev-Z' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('device-not-activated');
  });

  describe('terminal cap (v1 enforced=1; verifier honors any N)', () => {
    it('a 1-seat license: the single device passes', () => {
      expect(verifyLicense(makeLicense({ maxTerminals: 1 }), ctx()).ok).toBe(true);
    });
    it('a 1-seat license signed with 2 activations is rejected (over cap)', () => {
      const lic = makeLicense({
        maxTerminals: 1,
        activations: [
          { deviceFingerprint: 'dev-A', activatedAt: 't' },
          { deviceFingerprint: 'dev-B', activatedAt: 't' },
        ],
      });
      const res = verifyLicense(lic, ctx());
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe('seat-cap-exceeded');
    });
    it('an N-seat license: N devices pass, N+1 is over cap', () => {
      const acts = (n: number) => Array.from({ length: n }, (_, i) => ({ deviceFingerprint: `dev-${i}`, activatedAt: 't' }));
      // 3 of 3 → ok for any present device.
      const okLic = makeLicense({ maxTerminals: 3, activations: acts(3) });
      expect(verifyLicense(okLic, ctx({ deviceFingerprint: 'dev-2' })).ok).toBe(true);
      // 4 of 3 → over cap.
      const overLic = makeLicense({ maxTerminals: 3, activations: acts(4) });
      const res = verifyLicense(overLic, ctx({ deviceFingerprint: 'dev-2' }));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe('seat-cap-exceeded');
    });
    it('hasFreeSeat reflects remaining capacity', () => {
      expect(hasFreeSeat(makeLicense({ maxTerminals: 1, activations: [{ deviceFingerprint: 'dev-A', activatedAt: 't' }] }))).toBe(false);
      expect(hasFreeSeat(makeLicense({ maxTerminals: 2, activations: [{ deviceFingerprint: 'dev-A', activatedAt: 't' }] }))).toBe(true);
    });
  });
});

describe('license install (activation / upgrade / transfer = newer signed license)', () => {
  it('installs a newer, validly-signed license', () => {
    const cur = makeLicense({ version: 1 });
    const upgraded = makeLicense({ version: 2, tier: 'pro', maxTerminals: 3 });
    const res = installLicense(cur, upgraded, { publicKey: keys.publicKey, edition: 'retail' });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.license.payload.tier).toBe('pro'); expect(res.license.payload.maxTerminals).toBe(3); }
  });
  it('rejects a replay/downgrade (version not newer)', () => {
    const cur = makeLicense({ version: 2 });
    const old = makeLicense({ version: 2 });
    const res = installLicense(cur, old, { publicKey: keys.publicKey, edition: 'retail' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not-newer');
  });
  it('transfer: a re-issue without dev-A drops dev-A’s seat on next verify', () => {
    const cur = makeLicense({ version: 1 });
    const transferred = makeLicense({ version: 2, activations: [{ deviceFingerprint: 'dev-B', activatedAt: 't' }] });
    const res = installLicense(cur, transferred, { publicKey: keys.publicKey, edition: 'retail' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      // dev-A no longer has a seat.
      expect(verifyLicense(res.license, ctx({ deviceFingerprint: 'dev-A' })).ok).toBe(false);
      // dev-B does.
      expect(verifyLicense(res.license, ctx({ deviceFingerprint: 'dev-B' })).ok).toBe(true);
    }
  });
  it('rejects a forged/wrong-key license', () => {
    const other = generateLicenseKeyPair();
    const forged: SignedLicense = { payload: makeLicense({ version: 2 }).payload, signature: signPayload(makeLicense({ version: 2 }).payload, other.privateKey) };
    const res = installLicense(makeLicense({ version: 1 }), forged, { publicKey: keys.publicKey, edition: 'retail' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('bad-signature');
  });
  it('buildActivationRequest carries the device + current version', () => {
    const req = buildActivationRequest('lic-1', 'retail', 'dev-A', makeLicense({ version: 3 }));
    expect(req.currentVersion).toBe(3);
    expect(req.deviceFingerprint).toBe('dev-A');
  });
});

describe('device fingerprint', () => {
  it('is stable for the same hardware and salted (not the raw id)', () => {
    const info = { platformUuid: 'UUID-123', diskSerial: 'DISK-9' };
    const fp = deviceFingerprint(info);
    expect(fp).toBe(deviceFingerprint(info));
    expect(fp).not.toContain('UUID-123');
  });
  it('requires at least one strong identifier', () => {
    expect(() => deviceFingerprint({ hostname: 'pc' })).toThrow();
  });
  it('fuzzyMatch tolerates a single component change (disk swap) but not a full change', () => {
    const a = { platformUuid: 'P1', machineGuid: 'M1', diskSerial: 'D1' };
    const swapped = { platformUuid: 'P1', machineGuid: 'M1', diskSerial: 'D2' };
    const different = { platformUuid: 'PX', machineGuid: 'MX', diskSerial: 'DX' };
    expect(fuzzyMatch(a, swapped)).toBe(true);
    expect(fuzzyMatch(a, different)).toBe(false);
  });
});

describe('license store (offline file)', () => {
  it('saves and re-verifies on load; rejects a tampered file', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'kako-lic-'));
    const env = { KAKO_OFFLINE_HOME: home };
    try {
      const lic = makeLicense();
      saveLicense(lic, env);
      const loaded = loadLicense(keys.publicKey, env);
      expect(loaded?.payload.licenseId).toBe('lic-1');
      // Tamper on disk → fail closed.
      const bad = { ...lic, payload: { ...lic.payload, maxTerminals: 99 } };
      saveLicense(bad as SignedLicense, env);
      expect(() => loadLicense(keys.publicKey, env)).toThrow();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
