import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsSubnav } from '@/components/shared/settings-subnav';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadProductStructure } from '@/lib/onboarding/product-hierarchy-server';
import { ProductStructureBuilder } from './product-structure-builder';

/**
 * "Product Structure" — the business-friendly category-tree builder over the
 * configurable product hierarchy (erp_product_levels / erp_product_nodes),
 * seeded from the company's existing product categories. Cards + a visual tree
 * per the Back Office UX standard; the canonical catalog stays untouched.
 */
export default async function ProductStructurePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  if (!hasPermission(ctx, 'product.edit')) {
    return (
      <div>
        <PageHeader title={t('productStructure.pageTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('productStructure.adminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const res = await loadProductStructure();
  const data = res.ok && res.data ? res.data : { levels: [], nodes: [] };

  return (
    <div>
      <SettingsSubnav
        backLabel={t('related.backToSettings')}
        relatedLabel={t('related.title')}
        related={[{ href: '/settings/uom', label: t('settingsHome.uom') }]}
      />
      <PageHeader
        title={t('productStructure.pageTitle')}
        description={t('productStructure.pageDescription')}
      />
      <ProductStructureBuilder levels={data.levels} nodes={data.nodes} />
    </div>
  );
}
