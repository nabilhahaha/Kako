import type { LucideIcon } from 'lucide-react';
import { BackLink } from './back-link';
import { RelatedLinks } from './related-links';

/** Sub-navigation header for a Back Office settings screen: a "← Settings" link
 *  back to the Settings home, plus optional "Related" chips to sibling screens.
 *  Pure navigation — improves discoverability and reduces sidebar round-trips. */
export function SettingsSubnav({
  backLabel,
  relatedLabel,
  related = [],
}: {
  backLabel: string;
  relatedLabel: string;
  related?: { href: string; label: string; icon?: LucideIcon }[];
}) {
  return (
    <>
      <BackLink href="/settings" label={backLabel} />
      {related.length > 0 && <RelatedLinks label={relatedLabel} items={related} />}
    </>
  );
}
