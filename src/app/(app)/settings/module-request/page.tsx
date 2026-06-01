import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { ModuleRequestForm } from './module-request-form';

/** ── Module activation request (tenant side) ───────────────────────────────
 *  Company admins request enabling a module / pack / integrations; it routes
 *  through the platform module-activation workflow. Tracked in /requests. */
export default async function ModuleRequestPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const isAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title={t('moduleRequest.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('moduleRequest.adminOnly')}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('moduleRequest.title')} description={t('moduleRequest.subtitle')} />
      <ModuleRequestForm />
    </div>
  );
}
