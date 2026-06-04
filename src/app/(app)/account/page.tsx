import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { BRANCH_ROLES } from '@/lib/erp/constants';
import { Badge } from '@/components/ui/badge';
import { ChangePasswordForm } from './change-password-form';
import { getT } from '@/lib/i18n/server';

export default async function AccountPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t, locale } = await getT();

  return (
    <div>
      <PageHeader title={t('account.pageTitle')} description={t('account.pageDescription')} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm">
            <h3 className="mb-2 font-semibold">{t('account.profileCard.heading')}</h3>
            <Row label={t('account.profileCard.labelName')} value={ctx.profile.full_name || '—'} />
            <Row label={t('account.profileCard.labelEmail')} value={ctx.profile.email || '—'} />
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('account.profileCard.labelRole')}</span>
              <span>{ctx.isSuperAdmin ? <Badge variant="success">{t('account.profileCard.superAdmin')}</Badge> : BRANCH_ROLES[ctx.topRole][locale]}</span>
            </div>
            {ctx.memberships.length > 0 && (
              <div className="pt-2">
                <span className="text-muted-foreground">{t('account.profileCard.labelBranches')}</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ctx.memberships.map((m) => (
                    <Badge key={m.branch.id} variant="secondary">
                      {m.branch.name_ar || m.branch.name} · {BRANCH_ROLES[m.role][locale]}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-3 font-semibold">{t('account.passwordCard.heading')}</h3>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
