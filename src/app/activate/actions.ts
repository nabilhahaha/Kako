'use server';

// Offline license activation — verify + install a server-issued signed license.
// Offline-only; the public key is embedded at build time (KAKO_LICENSE_PUBLIC_KEY).
import { isOffline } from '@/lib/offline/runtime';
import { installLicense } from '@/lib/license/activate';
import { saveLicense, loadLicense } from '@/lib/license/store';
import { currentEdition } from '@/lib/edition/editions';
import type { SignedLicense } from '@/lib/license/types';

export interface ActivateResult {
  ok: boolean;
  error?: string;
  summary?: { edition: string; seats: string; validUntil: string | null };
}

export async function installLicenseAction(licenseJson: string): Promise<ActivateResult> {
  if (!isOffline()) return { ok: false, error: 'offline-only' };
  const publicKey = process.env.KAKO_LICENSE_PUBLIC_KEY;
  if (!publicKey) return { ok: false, error: 'no-public-key-configured' };

  let incoming: SignedLicense;
  try { incoming = JSON.parse(licenseJson) as SignedLicense; }
  catch { return { ok: false, error: 'invalid-license-json' }; }

  const edition = currentEdition().id;
  let current: SignedLicense | null = null;
  try { current = loadLicense(publicKey); } catch { current = null; }

  const res = installLicense(current, incoming, { publicKey, edition });
  if (!res.ok) return { ok: false, error: res.reason };

  saveLicense(res.license);
  const p = res.license.payload;
  return { ok: true, summary: { edition: p.edition, seats: `${p.activations.length}/${p.maxTerminals}`, validUntil: p.validUntil } };
}
