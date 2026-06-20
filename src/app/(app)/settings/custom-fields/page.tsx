import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ModulePage } from '@/components/admin/module-page';
import { TopGroupingNav } from '@/components/admin/top-grouping-nav';
import { listImportableEntities, listEntities } from '@/lib/erp/entities';
import { getFieldGovernanceAdmin } from '@/lib/erp/field-governance-server';
import type { CustomFieldDef } from '@/lib/erp/custom-fields';
import type { CustomerLookup } from '@/lib/erp/types';
import { CustomFieldsManager, type CfEntity } from './custom-fields-manager';
import { FieldGovernanceManager } from '../field-governance/field-governance-manager';
import { CustomerDataManager } from '../customer-data/customer-data-manager';

export const dynamic = 'force-dynamic';

/**
 * Custom Fields & Data (M3-B) — one page with three tabs rendering their existing
 * managers verbatim: Fields (CustomFieldsManager), Governance
 * (FieldGovernanceManager) and Customer Data (CustomerDataManager). Tabs are
 * URL-addressable (`?tab=`); the Governance tab also honours `?entity=` exactly
 * as before (the old route's redirect forwards it). All three share the
 * `settings.custom_fields` gate, so tabbing changes no access. Reuse only — no
 * manager/action/RLS change.
 */
type Tab = 'fields' | 'governance' | 'customer-data';

export default async function CustomFieldsPage({ searchParams }: { searchParams: Promise<{ tab?: string; entity?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  if (!hasPermission(ctx, 'settings.custom_fields')) {
    return (
      <div>
        <PageHeader title={t('customFields.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('customFields.noAccess')}</CardContent></Card>
      </div>
    );
  }

  const sp = await searchParams;
  const tab: Tab = sp.tab === 'governance' ? 'governance' : sp.tab === 'customer-data' ? 'customer-data' : 'fields';
  const supabase = await createClient();

  let content: React.ReactNode;
  if (tab === 'governance') {
    const entities = listEntities()
      .filter((e) => (e.fields?.length ?? 0) > 0)
      .map((e) => ({ key: e.key, labelAr: e.labelAr, labelEn: e.labelEn }));
    const entity = entities.find((e) => e.key === sp.entity)?.key ?? entities[0]?.key ?? 'customer';
    const admin = await getFieldGovernanceAdmin(supabase, entity);
    content = <FieldGovernanceManager entities={entities} admin={admin} isPlatformOwner={ctx.isPlatformOwner} />;
  } else if (tab === 'customer-data') {
    const { data: lookups } = await supabase
      .from('erp_customer_lookups')
      .select('*')
      .order('kind').order('sort').order('name');
    content = <CustomerDataManager lookups={(lookups as CustomerLookup[]) ?? []} />;
  } else {
    const entities: CfEntity[] = listImportableEntities().map((e) => ({ key: e.key, labelAr: e.labelAr, labelEn: e.labelEn }));
    const { data } = await supabase
      .from('erp_custom_fields')
      .select('id, entity, key, label_ar, label_en, type, required, options, validation, visibility, sort, is_active')
      .in('entity', entities.map((e) => e.key))
      .order('sort', { ascending: true });
    const fields = ((data as Record<string, unknown>[]) ?? []).map((r) => ({
      id: r.id as string, entity: r.entity as string, key: r.key as string,
      label_ar: r.label_ar as string, label_en: (r.label_en as string) ?? null,
      type: r.type as CustomFieldDef['type'], required: Boolean(r.required),
      options: Array.isArray(r.options) ? (r.options as CustomFieldDef['options']) : [],
      validation: (r.validation as CustomFieldDef['validation']) ?? {},
      visibility: (r.visibility as CustomFieldDef['visibility']) ?? null,
      sort: Number(r.sort ?? 0), is_active: Boolean(r.is_active),
    })) as CustomFieldDef[];
    content = <CustomFieldsManager entities={entities} fields={fields} />;
  }

  const tabs = [
    { key: 'fields', label: t('customFields.title'), href: '/settings/custom-fields?tab=fields', active: tab === 'fields' },
    { key: 'governance', label: t('fieldGov.title'), href: '/settings/custom-fields?tab=governance', active: tab === 'governance' },
    { key: 'customer-data', label: t('customerData.pageTitle'), href: '/settings/custom-fields?tab=customer-data', active: tab === 'customer-data' },
  ];

  return (
    <ModulePage nav={<TopGroupingNav items={tabs} ariaLabel={t('customFields.title')} />}>
      {content}
    </ModulePage>
  );
}
