import { ALERTS_ENABLED } from '@/lib/alerts';
import { CHANGE_REQUESTS_ENABLED } from '@/lib/change-requests';
import { VAN_SALES_ENABLED } from '@/lib/van-sales';
import { TRADE_SPEND_ENABLED } from '@/lib/trade-spend/flags';
import { DISTRIBUTION_ENABLED } from '@/lib/distribution/flags';

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
  // A3 hygiene: bind nav visibility to the SAME flag the page enforces, so a
  // flag-gated page never shows-then-404s. trade-spend → KAKO_TRADE_SPEND,
  // coverage → KAKO_DISTRIBUTION (both pages notFound() when their flag is off).
  if (TRADE_SPEND_ENABLED()) flags.push('trade_spend');
  if (DISTRIBUTION_ENABLED()) flags.push('distribution');
  return flags;
}
