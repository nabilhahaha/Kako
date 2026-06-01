import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { getT } from '@/lib/i18n/server';
import { PromotionDetail, type PromotionFull } from './promotion-detail';

/** TPM-2 — promotion detail: audience builder, lifecycle, performance. */
export default async function PromotionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.company?.id || !ctx.modules.includes('field_ops')) redirect('/commercial/promotions');
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc('erp_tpm_promotion_get', { p_id: id });
  if (!data) notFound();
  const isAdmin = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-10">
      <BackLink href="/commercial/promotions" label={t('commercial.tpm.title')} />
      <PageHeader title={(data as PromotionFull).name} />
      <PromotionDetail promo={data as PromotionFull} isAdmin={isAdmin} />
    </div>
  );
}
