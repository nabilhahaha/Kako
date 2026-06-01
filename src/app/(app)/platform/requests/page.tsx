import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getPlatformContext } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { ApprovalsManager } from '../../approvals/approvals-manager';
import { loadPlatformTasks } from '../../requests/data';

/** ── Platform Inbox (platform-scope approvals) ─────────────────────────────
 *  Pending platform-scope workflow tasks the platform owner / staff can act on
 *  (billing, onboarding, customization…). Same engine + decide path as tenant
 *  approvals; invisible to tenant users via scope-aware RLS. */
export default async function PlatformRequestsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const pctx = await getPlatformContext();
  if (!pctx || !pctx.isStaff) {
    return (
      <div>
        <PageHeader title={t('platform.requests.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('platform.ownerOnly')}</CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const rows = await loadPlatformTasks(supabase, pctx);

  return (
    <div>
      <PageHeader title={t('platform.requests.title')} description={t('platform.requests.subtitle')} />
      <ApprovalsManager tasks={rows} />
    </div>
  );
}
