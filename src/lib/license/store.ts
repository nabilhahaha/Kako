// ============================================================================
// Offline licensing — local store (Phase P4)
// ----------------------------------------------------------------------------
// Persists the signed license file in the offline data dir and loads it back,
// re-verifying the signature on load. Offline/server-side only.
// ============================================================================

import type { KeyObject } from 'node:crypto';
import fs from 'node:fs';
import { offlinePaths } from '@/lib/offline/runtime';
import { verifyPayload } from './sign';
import type { SignedLicense } from './types';

type EnvLike = Record<string, string | undefined>;

function licensePath(env: EnvLike): string {
  return offlinePaths('Kako', process.platform, env).licenseFile;
}

/** Persist a signed license atomically. */
export function saveLicense(license: SignedLicense, env: EnvLike = process.env): void {
  const file = licensePath(env);
  fs.mkdirSync(offlinePaths('Kako', process.platform, env).root, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(license, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Load + signature-check the stored license. Returns null if absent; throws on
 *  a present-but-tampered file (fail closed). */
export function loadLicense(publicKey: string | KeyObject, env: EnvLike = process.env): SignedLicense | null {
  const file = licensePath(env);
  if (!fs.existsSync(file)) return null;
  const license = JSON.parse(fs.readFileSync(file, 'utf8')) as SignedLicense;
  if (!verifyPayload(license.payload, license.signature, publicKey)) {
    throw new Error('stored license failed signature verification (tampered)');
  }
  return license;
}

export function hasLicense(env: EnvLike = process.env): boolean {
  return fs.existsSync(licensePath(env));
}
