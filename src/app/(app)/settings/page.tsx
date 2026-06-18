import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Building2, Receipt, Hash, Users, ShieldCheck, UserCog, Network, Map, Layers,
  GitBranch, LayoutGrid, Plug, RefreshCw, Upload, Rocket, ArrowRight, Coins,
  type LucideIcon,
} from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import type { Permission } from '@/lib/erp/permissions';
import type { Module } from '@/lib/erp/navigation';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Settings home — a business-friendly landing for the Back Office (per the Back
 * Office UX standard). Pure navigation/discoverability: surfaces every settings
 * area as a permission-aware card, grouped into business sections, so a Company
 * Admin can find things without scanning the sidebar. No data writes, no logic.
 */

interface Item { label: string; desc: string; href: string; icon: LucideIcon; perm?: Permission; superAdminOnly?: boolean; module?: Module }
interface Section { title: string; items: Item[] }

const SECTIONS: Section[] = [
  {
    title: 'settingsHome.sections.company',
    items: [
      { label: 'settingsHome.branches', desc: 'settingsHome.branchesDesc', href: '/settings/branches', icon: Building2, perm: 'settings.branches' },
      { label: 'settingsHome.finance', desc: 'settingsHome.financeDesc', href: '/settings/finance', icon: Coins, perm: 'settings.branches' },
      { label: 'settingsHome.taxReg', desc: 'settingsHome.taxRegDesc', href: '/settings/tax-registrations', icon: Receipt, perm: 'settings.branches' },
      { label: 'settingsHome.numbering', desc: 'settingsHome.numberingDesc', href: '/settings/numbering', icon: Hash, perm: 'settings.branches' },
    ],
  },
  {
    title: 'settingsHome.sections.people',
    items: [
      { label: 'settingsHome.users', desc: 'settingsHome.usersDesc', href: '/settings/users', icon: Users, superAdminOnly: true },
      { label: 'settingsHome.staff', desc: 'settingsHome.staffDesc', href: '/settings/staff', icon: UserCog, perm: 'settings.users' },
      { label: 'settingsHome.permissions', desc: 'settingsHome.permissionsDesc', href: '/settings/permissions', icon: ShieldCheck, superAdminOnly: true },
    ],
  },
  {
    title: 'settingsHome.sections.org',
    items: [
      { label: 'settingsHome.orgStructure', desc: 'settingsHome.orgStructureDesc', href: '/settings/organization-structure', icon: Network, perm: 'settings.users' },
      { label: 'settingsHome.reporting', desc: 'settingsHome.reportingDesc', href: '/settings/organization', icon: UserCog, perm: 'settings.users' },
      { label: 'settingsHome.regions', desc: 'settingsHome.regionsDesc', href: '/settings/regions', icon: Map, perm: 'settings.branches' },
    ],
  },
  {
    title: 'settingsHome.sections.products',
    items: [
      { label: 'settingsHome.productStructure', desc: 'settingsHome.productStructureDesc', href: '/settings/product-structure', icon: Layers, perm: 'product.edit' },
      { label: 'settingsHome.uom', desc: 'settingsHome.uomDesc', href: '/settings/uom', icon: Layers, perm: 'uom.manage' },
    ],
  },
  {
    title: 'settingsHome.sections.workflows',
    items: [
      { label: 'settingsHome.approvalMatrix', desc: 'settingsHome.approvalMatrixDesc', href: '/settings/approval-matrix', icon: ShieldCheck, perm: 'workflow.manage', module: 'workflow' },
      { label: 'settingsHome.workflows', desc: 'settingsHome.workflowsDesc', href: '/settings/workflows', icon: GitBranch, perm: 'workflow.manage', module: 'workflow' },
      { label: 'settingsHome.workflowTemplates', desc: 'settingsHome.workflowTemplatesDesc', href: '/settings/workflows/templates', icon: LayoutGrid, perm: 'workflow.manage', module: 'workflow' },
    ],
  },
  {
    title: 'settingsHome.sections.integrations',
    items: [
      { label: 'settingsHome.integrationHub', desc: 'settingsHome.integrationHubDesc', href: '/settings/integration-hub', icon: Network, perm: 'integrations.manage', module: 'integrations' },
      { label: 'settingsHome.import', desc: 'settingsHome.importDesc', href: '/settings/import', icon: Upload, perm: 'integrations.manage', module: 'integrations' },
      { label: 'settingsHome.connections', desc: 'settingsHome.connectionsDesc', href: '/settings/integrations/connections', icon: Plug, perm: 'integrations.manage', module: 'integrations' },
      { label: 'settingsHome.sync', desc: 'settingsHome.syncDesc', href: '/settings/integrations/sync', icon: RefreshCw, perm: 'integrations.manage', module: 'integrations' },
    ],
  },
  {
    title: 'settingsHome.sections.modules',
    items: [
      { label: 'settingsHome.features', desc: 'settingsHome.featuresDesc', href: '/settings/features', icon: LayoutGrid, perm: 'settings.users' },
      { label: 'settingsHome.marketplace', desc: 'settingsHome.marketplaceDesc', href: '/settings/marketplace', icon: LayoutGrid, perm: 'settings.users' },
    ],
  },
];

export default async function SettingsHomePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const can = (i: Item) =>
    (i.superAdminOnly ? ctx.isSuperAdmin : true) &&
    (i.perm ? hasPermission(ctx, i.perm) : true) &&
    (i.module ? ctx.modules.includes(i.module) : true);

  const sections = SECTIONS
    .map((s) => ({ ...s, items: s.items.filter(can) }))
    .filter((s) => s.items.length > 0);

  const showGoLive = hasPermission(ctx, 'integrations.manage');

  return (
    <div>
      <PageHeader title={t('settingsHome.title')} description={t('settingsHome.description')} />

      {showGoLive && (
        <Link href="/settings/go-live" className="mb-6 block">
          <Card className="border-primary/40 transition-colors hover:bg-primary/5">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Rocket className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t('settingsHome.goLiveTitle')}</p>
                <p className="text-sm text-muted-foreground">{t('settingsHome.goLiveDesc')}</p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
            </CardContent>
          </Card>
        </Link>
      )}

      <div className="space-y-6">
        {sections.map((s) => (
          <section key={s.title} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t(s.title)}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.items.map((i) => (
                <Link key={i.href} href={i.href} className="block h-full">
                  <Card className="h-full transition-colors hover:bg-secondary/50">
                    <CardContent className="flex h-full items-start gap-3 p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                        <i.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium leading-tight">{t(i.label)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t(i.desc)}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
