import { requireAnyPermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { PrinterForm, type PrintSettings } from './printer-form';

export default async function PrinterSettingsPage() {
  const ctx = await requireAnyPermission(['settings.users', 'fashion.manage', 'fashion.cashbox']);
  const { t } = await getT();

  const supabase = await createClient();
  const { data } = ctx.companyId
    ? await supabase.from('erp_ops_settings').select('receipt_paper, receipt_header, receipt_footer, show_logo, show_tax_number').eq('company_id', ctx.companyId).maybeSingle()
    : { data: null };

  return (
    <div>
      <PageHeader title={t('settings.printer.title')} description={t('settings.printer.description')} />
      <PrinterForm settings={(data as PrintSettings) ?? null} />
    </div>
  );
}
