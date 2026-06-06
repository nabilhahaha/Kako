'use server';

// Offline license activation — verify + install a server-issued signed license.
// Offline-only; the public key is embedded at build time (KAKO_LICENSE_PUBLIC_KEY).
import { isOffline } from '@/lib/offline/runtime';
import { installLicense } from '@/lib/license/activate';
import { verifyLicense } from '@/lib/license/verify';
import { saveLicense, loadLicense } from '@/lib/license/store';
import { currentEdition } from '@/lib/edition/editions';
import type { SignedLicense } from '@/lib/license/types';

export interface ActivateResult {
  ok: boolean;
  error?: string;
  summary?: { edition: string; seats: string; validUntil: string | null };
}

/**
 * Install a server-issued signed license for THIS device.
 *
 * AU-2: the caller passes the device fingerprint (from the Tauri shell). After
 * a valid install we re-verify the license against this fingerprint — the
 * server is expected to have bound a seat to it (`activations[]`). If it didn't,
 * we reject here with a clear `device-not-activated` instead of letting the
 * launch-time gate fail opaquely later. AU-8: all disk writes are guarded so a
 * save failure surfaces as a result, never an unhandled rejection.
 */
export async function installLicenseAction(
  licenseJson: string,
  deviceFingerprint?: string,
): Promise<ActivateResult> {
  if (!isOffline()) return { ok: false, error: 'offline-only' };
  const publicKey = process.env.KAKO_LICENSE_PUBLIC_KEY;
  if (!publicKey) return { ok: false, error: 'no-public-key-configured' };

  let incoming: SignedLicense;
  try { incoming = JSON.parse(licenseJson) as SignedLicense; }
  catch { return { ok: false, error: 'invalid-license-json' }; }

  const ed = currentEdition();
  let current: SignedLicense | null = null;
  try { current = loadLicense(publicKey); } catch { current = null; }

  const res = installLicense(current, incoming, { publicKey, edition: ed.id });
  if (!res.ok) return { ok: false, error: res.reason };

  // AU-2: confirm the server actually bound a seat to this device before we
  // persist it. (Skipped only when no fingerprint is available, e.g. running
  // outside the Tauri shell during development.)
  if (deviceFingerprint && deviceFingerprint !== '—' && deviceFingerprint !== 'unavailable') {
    const v = verifyLicense(res.license, {
      publicKey,
      edition: ed.id,
      productCode: ed.productCode,
      deviceFingerprint,
    });
    if (!v.ok) return { ok: false, error: v.reason };
  }

  try {
    saveLicense(res.license);
  } catch {
    return { ok: false, error: 'save-failed' };
  }

  const p = res.license.payload;
  return { ok: true, summary: { edition: p.edition, seats: `${p.activations.length}/${p.maxTerminals}`, validUntil: p.validUntil } };
}

export interface LicenseCheck { ok: boolean; reason?: string }

/**
 * Launch-time license check for the offline edition (AU-1). Returns ok only when
 * a stored license verifies (signature, edition, expiry, seat cap) AND is bound
 * to this device. The cloud build is never gated here.
 *
 * Licensing is VENDOR-OPT-IN: it is enforced only when the build bakes
 * KAKO_LICENSE_PUBLIC_KEY. Without a configured public key there is nothing to
 * verify signatures against, so enforcement is DISABLED (ok:true) rather than
 * locking the user out — a build with no key is a build the vendor chose not to
 * license-gate. To enable enforcement, set KAKO_LICENSE_PUBLIC_KEY at build time
 * (see scripts/offline/build-app.mjs / the release workflow).
 *
 * When enforcement IS on, this is fail-closed: missing / tampered / unbound
 * licenses return ok:false so the UI redirects to /activate.
 */
export async function checkDeviceLicense(deviceFingerprint: string): Promise<LicenseCheck> {
  if (!isOffline()) return { ok: true };
  const publicKey = process.env.KAKO_LICENSE_PUBLIC_KEY;
  if (!publicKey) return { ok: true }; // licensing not configured → not enforced

  let lic: SignedLicense | null;
  try { lic = loadLicense(publicKey); } catch { return { ok: false, reason: 'tampered' }; }
  if (!lic) return { ok: false, reason: 'no-license' };

  if (!deviceFingerprint || deviceFingerprint === '—' || deviceFingerprint === 'unavailable') {
    return { ok: false, reason: 'no-fingerprint' };
  }

  const ed = currentEdition();
  const v = verifyLicense(lic, {
    publicKey,
    edition: ed.id,
    productCode: ed.productCode,
    deviceFingerprint,
  });
  return v.ok ? { ok: true } : { ok: false, reason: v.reason };
}
