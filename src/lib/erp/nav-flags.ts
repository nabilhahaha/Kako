import { ALERTS_ENABLED } from '@/lib/alerts';
import { CHANGE_REQUESTS_ENABLED } from '@/lib/change-requests';
import { VAN_SALES_ENABLED } from '@/lib/van-sales';

// Resolves the feature-flag tokens that should make their nav items appear.
// Reads the existing server-side flag helpers (process.env KAKO_*), so it MUST
// run server-side; the resulting string[] is safe to pass to client nav
// components (it is just the set of enabled feature toggles, no secrets). Each
// token here matches a NavItem.flag in navigation.ts. Adding a flag-gated nav
// item = add its helper here + set `flag` on the item.
export function enabledNavFlags(): string[] {
  const flags: string[] = [];
  if (ALERTS_ENABLED()) flags.push('alerts');
  if (CHANGE_REQUESTS_ENABLED()) flags.push('change_requests');
  if (VAN_SALES_ENABLED()) flags.push('van_sales');
  return flags;
}
