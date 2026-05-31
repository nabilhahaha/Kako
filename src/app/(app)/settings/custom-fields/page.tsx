import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listImportableEntities } from '@/lib/erp/entities';
import type { CustomFieldDef } from '@/lib/erp/custom-fields';
import { CustomFieldsManager, type CfEntity } from './custom-fields-manager';

/** ── Custom Fields management (settings.custom_fields) ─────────────────────
 *  Per-company, per-entity field definitions. Values live in the entity row's
 *  `custom` jsonb; these definitions drive import/export + Dynamic Forms. */
export default async function CustomFieldsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!hasPermission(ctx, 'settings.custom_fields')) {
    return (
      <div>
        <PageHeader title={t('customFields.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('customFields.noAccess')}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Entities that carry a `custom` jsonb column (the Phase-A set).
  const entities: CfEntity[] = listImportableEntities().map((e) => ({
    key: e.key, labelAr: e.labelAr, labelEn: e.labelEn,
  }));
  const entityKeys = entities.map((e) => e.key);

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_custom_fields')
    .select('id, entity, key, label_ar, label_en, type, required, options, validation, visibility, sort, is_active')
    .in('entity', entityKeys)
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

  return (
    <div>
      <PageHeader title={t('customFields.title')} description={t('customFields.subtitle')} />
      <CustomFieldsManager entities={entities} fields={fields} />
    </div>
  );
}
