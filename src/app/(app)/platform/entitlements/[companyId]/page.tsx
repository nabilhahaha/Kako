import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ENTITLEMENTS_ENABLED } from '@/lib/entitlements';
import { loadCapabilityMatrix } from '@/lib/entitlements/matrix-server';
import { CapabilityMatrix } from './matrix';

export const dynamic = 'force-dynamic';

// Platform Owner — Company Capability Matrix: enable/disable modules + engines.
export default async function CompanyEntitlementsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ENTITLEMENTS_ENABLED()) notFound();
  if (!ctx.isPlatformOwner && !ctx.isSuperAdmin) notFound();

  const { companyId } = await params;
  const { t } = await getT();
  const supabase = await createClient();
  const { data: company } = await supabase.from('erp_companies').select('name').eq('id', companyId).maybeSingle();
  const rows = await loadCapabilityMatrix(supabase, companyId);

  return (
    <div className="space-y-6">
      <PageHeader title={t('entitlements.title')} description={(company as { name: string } | null)?.name ?? companyId} />
      <CapabilityMatrix companyId={companyId} rows={rows} />
    </div>
  );
}
