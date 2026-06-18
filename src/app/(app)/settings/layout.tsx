import { getUserContext } from '@/lib/erp/auth-context';
import { allowedSettingsHrefs, visibleSettingsGroups } from '@/lib/erp/settings-sections';
import { ModulePage } from '@/components/admin/module-page';
import { SettingsGroupNav } from '@/components/admin/settings-group-nav';

/**
 * Settings layout — implements the VANTORA Navigation Standard ("One rail, then
 * rise"): the Settings hub is re-chunked into ≤5 top groups and the active
 * group's pages, both rendered as top-grouping tabs (no persistent side rail).
 * The selected settings page renders verbatim in the content area. UX
 * standardization only — every existing settings page is unchanged; no
 * business-logic / permission / RLS / workflow change. Visibility is computed
 * server-side and remains permission-aware.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getUserContext();
  const groups = ctx ? visibleSettingsGroups(allowedSettingsHrefs(ctx)) : [];

  return (
    <ModulePage nav={<SettingsGroupNav groups={groups} />}>
      {children}
    </ModulePage>
  );
}
