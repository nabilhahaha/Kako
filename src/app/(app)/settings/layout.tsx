import { getUserContext } from '@/lib/erp/auth-context';
import { resolveSettingsNavGroups } from '@/lib/erp/settings-nav-server';
import { ModulePage } from '@/components/admin/module-page';
import { SettingsGroupNav } from '@/components/admin/settings-group-nav';

/**
 * Settings layout — the canonical Settings navigator (Navigation Standard). The
 * global sidebar collapses Settings to a single link; here the one settings
 * catalog (navigation.ts, via resolveSettingsNavGroups) is rendered as the
 * two-tier Top Grouping. One source of truth, permission-aware, no second
 * taxonomy. Pages render verbatim in the content area — no business-logic /
 * permission / RLS / workflow change.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getUserContext();
  const groups = ctx ? await resolveSettingsNavGroups(ctx) : [];
  const navGroups = groups.map((g) => ({
    key: g.key,
    label: g.key,
    items: g.items.map((i) => ({ label: i.label, href: i.href })),
  }));

  return (
    <ModulePage nav={<SettingsGroupNav groups={navGroups} />}>
      {children}
    </ModulePage>
  );
}
