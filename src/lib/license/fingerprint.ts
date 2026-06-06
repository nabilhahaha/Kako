// ============================================================================
// Offline licensing — device fingerprint (Phase P4)
// ----------------------------------------------------------------------------
// The hardware-bound part of activation. The RAW per-OS identifiers come from
// the Tauri shell (src-tauri/src/fingerprint.rs: macOS IOPlatformUUID, Windows
// MachineGuid + SMBIOS UUID + disk serial) and are passed to the Node layer,
// which SALTS + HASHES them — the raw ids never touch the license or disk.
//
// `fuzzyMatch` tolerates a single component change (e.g. a swapped disk) so a
// minor hardware change doesn't lock a store out.
// ============================================================================

import { createHash } from 'node:crypto';

/** Raw identifiers gathered by the shell (any subset may be present). */
export interface RawDeviceInfo {
  /** macOS IOPlatformUUID. */
  platformUuid?: string;
  /** Windows MachineGuid. */
  machineGuid?: string;
  /** SMBIOS system UUID. */
  smbiosUuid?: string;
  /** Primary disk serial. */
  diskSerial?: string;
  /** Hostname (weakest signal; never used alone). */
  hostname?: string;
}

const SALT = 'kako-offline-device-v1';

function hashComponent(label: string, value: string): string {
  return createHash('sha256').update(`${SALT}:${label}:${value}`).digest('hex').slice(0, 16);
}

/** The strong components, in priority order, that identify a device. */
function components(info: RawDeviceInfo): string[] {
  const out: string[] = [];
  if (info.platformUuid) out.push(hashComponent('platform', info.platformUuid));
  if (info.machineGuid) out.push(hashComponent('machine', info.machineGuid));
  if (info.smbiosUuid) out.push(hashComponent('smbios', info.smbiosUuid));
  if (info.diskSerial) out.push(hashComponent('disk', info.diskSerial));
  return out;
}

/** A single salted fingerprint string for the device. Throws if there isn't at
 *  least one strong identifier (hostname alone is not enough). */
export function deviceFingerprint(info: RawDeviceInfo): string {
  const comps = components(info);
  if (comps.length === 0) throw new Error('no strong device identifier available for fingerprint');
  return createHash('sha256').update(comps.sort().join('|')).digest('hex');
}

/** True if two devices are "the same" allowing ONE component to differ
 *  (hardware drift tolerance). Both must share a majority of strong components. */
export function fuzzyMatch(a: RawDeviceInfo, b: RawDeviceInfo): boolean {
  const setA = new Set(components(a));
  const setB = new Set(components(b));
  if (setA.size === 0 || setB.size === 0) return false;
  let shared = 0;
  for (const c of setA) if (setB.has(c)) shared++;
  const minSize = Math.min(setA.size, setB.size);
  // Identical, or differ by at most one component (and share at least one).
  return shared >= Math.max(1, minSize - 1);
}
