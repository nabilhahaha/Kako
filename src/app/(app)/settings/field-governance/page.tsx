import { redirect } from 'next/navigation';
import { requireNonRetailAdmin } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listEntities } from '@/lib/erp/entities';
import { getFieldGovernanceAdmin } from '@/lib/erp/field-governance-server';
import { FieldGovernanceManager } from './field-governance-manager';

/** Settings → Field Governance (DFG-2). Entity-agnostic admin UI: per-company
 *  sections, field layout, and the role/permission access matrix. Gated on
 *  settings.custom_fields. */
export default async function FieldGovernancePage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  await requireNonRetailAdmin();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!hasPermission(ctx, 'settings.custom_fields')) {
    return (
      <div>
        <PageHeader title={t('fieldGov.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('fieldGov.superAdminOnly')}</CardContent></Card>
      </div>
    );
  }

  // Governable entities = registry entities that declare a field catalog.
  const entities = listEntities()
    .filter((e) => (e.fields?.length ?? 0) > 0)
    .map((e) => ({ key: e.key, labelAr: e.labelAr, labelEn: e.labelEn }));
  const sp = await searchParams;
  const entity = entities.find((e) => e.key === sp.entity)?.key ?? entities[0]?.key ?? 'customer';

  const supabase = await createClient();
  const admin = await getFieldGovernanceAdmin(supabase, entity);

  return (
    <div>
      <PageHeader title={t('fieldGov.title')} description={t('fieldGov.description')} />
      <FieldGovernanceManager entities={entities} admin={admin} isPlatformOwner={ctx.isPlatformOwner} />
    </div>
  );
}
