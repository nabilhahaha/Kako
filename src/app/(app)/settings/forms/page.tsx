import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { FormsList, type FormRow } from './forms-list';

/** ── Form Designer — forms list (B2) ───────────────────────────────────────
 *  Company admins build no-code request types. Shows the tenant's own forms and
 *  the global templates (clone-to-customize). */
export default async function FormsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title={t('forms.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('forms.adminOnly')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_form_definitions')
    .select('id, company_id, key, name_ar, name_en, status, version, workflow_key')
    .eq('is_latest', true)
    .order('created_at', { ascending: false });
  const rows = (data as FormRow[]) ?? [];

  return (
    <div>
      <PageHeader title={t('forms.title')} description={t('forms.subtitle')} />
      <FormsList
        myForms={rows.filter((r) => r.company_id !== null)}
        templates={rows.filter((r) => r.company_id === null)}
      />
    </div>
  );
}
