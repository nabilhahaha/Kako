// Field Verification — GPS / radius enforcement helpers (pure, no I/O / no React) so the
// ON/OFF submit rule and the "radius not enforced" badge are unit-tested and reused by the
// submit action + the completed detail / reports.

import { isWithinRadius } from '@/lib/erp/geo-distance';

/** Whether the radius lock was in force for a submit (mirrors the Form Builder requireGps
 *  setting). Persisted per verification as erp_rp_customer_verifications.radius_enforced. */
export function radiusEnforced(requireGps: boolean): boolean {
  return !!requireGps;
}

/**
 * Does the radius lock BLOCK this submit?
 *  - requireGps OFF → never blocks on proximity (the admin disabled radius enforcement).
 *  - requireGps ON  → blocks when there is no usable distance fix, or the rep is outside the
 *    allowed radius (today's behavior). Photos + required fields are enforced separately.
 */
export function radiusLockBlocks(requireGps: boolean, distanceM: number | null, radiusM: number): boolean {
  if (!requireGps) return false;
  if (distanceM == null) return true;
  return !isWithinRadius(distanceM, radiusM);
}

/** True when a COMPLETED verification was submitted with radius enforcement disabled — drives
 *  the "Submitted without radius enforcement" badge. Null (legacy rows) = enforced. */
export function radiusWaived(v: { radiusEnforced?: boolean | null }): boolean {
  return v.radiusEnforced === false;
}
