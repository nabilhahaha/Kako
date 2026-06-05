import { redirect } from 'next/navigation';
import { requireNonRetailAdmin } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { EtaSettingsForm, type EtaSettings } from './eta-settings-form';

export default async function EInvoicePage() {
  await requireNonRetailAdmin();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  if (!ctx.isSuperAdmin) {
    return (
      <div>
        <PageHeader title={t('settings.eta.pageTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('settings.branches.superAdminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_company_eta_settings')
    .select('*')
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  return (
    <div>
      <PageHeader title={t('settings.eta.pageTitle')} description={t('settings.eta.pageDescription')} />
      <EtaSettingsForm settings={(data as EtaSettings | null) ?? null} />
    </div>
  );
}
