import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { getT } from '@/lib/i18n/server';
import { ChangeDetail, type ChangeFull, type Impact, type RollbackPreview } from './change-detail';

/** CG-2 — change detail: timeline, pilot visibility, impact + rollback preview, lifecycle. */
export default async function ChangeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isAdmin = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
  if (!ctx.company?.id || !isAdmin) redirect('/governance');
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc('erp_cfg_change_get', { p_id: id });
  if (!data) notFound();
  const change = data as ChangeFull;
  const [impact, rb] = await Promise.all([
    supabase.rpc('erp_cfg_impact', { p_id: id }),
    change.state === 'published' ? supabase.rpc('erp_cfg_rollback_preview', { p_id: id }) : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-10">
      <BackLink href="/governance" label={t('governance.back')} />
      <PageHeader title={change.title} />
      <ChangeDetail change={change} impact={(impact.data as Impact) ?? null} rollback={(rb.data as RollbackPreview) ?? null} />
    </div>
  );
}
