import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ENTITLEMENTS_ENABLED } from '@/lib/entitlements';
import { loadRoleMatrix } from '@/lib/entitlements/matrix-server';

export const dynamic = 'force-dynamic';

// Company Admin — read-only Role Permission Matrix + entitlement summary. No
// writes (display only): edits go through the existing role settings. Flag-gated.
export default async function RoleMatrixPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ENTITLEMENTS_ENABLED()) notFound();
  if (!hasPermission(ctx, 'settings.branches') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const supabase = await createClient();
  const matrix = ctx.companyId ? await loadRoleMatrix(supabase, ctx.companyId) : [];

  return (
    <div className="space-y-6">
      <PageHeader title={t('entitlements.summaryTitle')} description={t('entitlements.summarySubtitle')} />
      <div className="space-y-3">
        {matrix.map((r) => (
          <Card key={r.roleKey}>
            <CardContent className="space-y-2 pt-6">
              <div className="text-sm font-semibold capitalize">{r.roleKey}</div>
              {r.permissions.length === 0 ? (
                <div className="text-xs text-muted-foreground">{t('entitlements.noPermissions')}</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {r.permissions.map((p) => (
                    <span
                      key={p.permission}
                      title={p.gated ? t('entitlements.gatedHint') : undefined}
                      className={`rounded px-1.5 py-0.5 text-xs ${p.gated ? 'bg-amber-100 text-amber-800 line-through dark:bg-amber-900/40 dark:text-amber-200' : 'bg-secondary text-muted-foreground'}`}
                    >
                      {p.permission}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
