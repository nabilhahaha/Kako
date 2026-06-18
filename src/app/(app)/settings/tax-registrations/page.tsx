import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadTaxRegistrations } from '@/lib/onboarding/tax-registration-server';
import { TaxRegistrationsManager } from './tax-registrations-manager';

/**
 * "Tax Registrations" — manage the company's VAT / tax registration records over
 * the existing erp_tax_registrations table. The company's default legal entity
 * is auto-provisioned behind the scenes, so the admin only deals with simple
 * registration cards. Configuration only — treasury untouched.
 */
export default async function TaxRegistrationsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();
  if (!hasPermission(ctx, 'settings.branches')) {
    return (
      <div>
        <PageHeader title={t('taxReg.pageTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('taxReg.adminOnly')}</CardContent>
        </Card>
      </div>
    );
  }

  const res = await loadTaxRegistrations();
  const data = res.ok && res.data ? res.data : { registrations: [], countries: [], companyCountry: null };

  return (
    <div>
      <PageHeader title={t('taxReg.pageTitle')} description={t('taxReg.pageDescription')} />
      <TaxRegistrationsManager
        registrations={data.registrations}
        countries={data.countries}
        companyCountry={data.companyCountry}
      />
    </div>
  );
}
