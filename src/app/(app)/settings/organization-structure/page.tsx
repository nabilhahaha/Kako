import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsSubnav } from '@/components/shared/settings-subnav';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadOrgStructure } from '@/lib/onboarding/org-hierarchy-server';
import { OrgStructureBuilder } from './org-structure-builder';

/**
 * "Organization Structure" — the business-friendly org-chart builder over the
 * configurable hierarchy (erp_org_levels / erp_org_nodes), seeded from the
 * company's existing regions/areas/branches/teams. Per the Back Office UX
 * standard: cards + a visual tree (not a database table), plain-language labels,
 * mobile-first. The frozen authorization / reporting model is untouched — this
 * configures structure only.
 */
export default async function OrganizationStructurePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  if (!hasPermission(ctx, 'settings.users')) {
    return (
      <div>
        <PageHeader title={t('orgStructure.pageTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('orgStructure.adminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const res = await loadOrgStructure();
  const data = res.ok && res.data ? res.data : { levels: [], nodes: [], people: [] };

  return (
    <div>
      <SettingsSubnav
        backLabel={t('related.backToSettings')}
        relatedLabel={t('related.title')}
        related={[{ href: '/settings/organization', label: t('settingsHome.reporting') }]}
      />
      <PageHeader
        title={t('orgStructure.pageTitle')}
        description={t('orgStructure.pageDescription')}
      />
      <OrgStructureBuilder
        levels={data.levels}
        nodes={data.nodes}
        people={data.people}
      />
    </div>
  );
}
