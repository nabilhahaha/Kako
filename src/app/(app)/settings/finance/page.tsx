import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadCompanyFinance } from '@/lib/onboarding/finance-server';
import { FinanceManager } from './finance-manager';

/**
 * "Tax & Currency" — business-friendly company finance setup over erp_companies
 * + erp_country_vat. Country, currency and tax number, with the standard VAT
 * rate shown automatically. Configuration only — treasury is never touched.
 */
export default async function FinancePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  if (!hasPermission(ctx, 'settings.branches')) {
    return (
      <div>
        <PageHeader title={t('finance.pageTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('finance.adminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const res = await loadCompanyFinance();
  const data = res.ok && res.data
    ? res.data
    : { country: null, currency: null, taxNumber: null, countries: [], vatRate: null };

  return (
    <div>
      <PageHeader title={t('finance.pageTitle')} description={t('finance.pageDescription')} />
      <FinanceManager
        country={data.country}
        currency={data.currency}
        taxNumber={data.taxNumber}
        countries={data.countries}
        vatRate={data.vatRate}
      />
    </div>
  );
}
