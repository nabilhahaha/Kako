import { getUserContext } from '@/lib/erp/auth-context';
import { allowedSettingsHrefs } from '@/lib/erp/settings-sections';
import { SettingsNav } from '@/components/admin/settings-nav';

/**
 * Settings layout — a persistent, searchable, permission-aware Settings nav on
 * the left; the selected settings page renders in the center and swaps while the
 * nav stays fixed (Azure / Salesforce-Setup style). UX standardization only —
 * every existing settings page renders verbatim; no business-logic / permission /
 * RLS / workflow change. The nav is collapsible to give full width when needed.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getUserContext();
  const allowedHrefs = ctx ? allowedSettingsHrefs(ctx) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
      <aside>
        <SettingsNav allowedHrefs={allowedHrefs} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
