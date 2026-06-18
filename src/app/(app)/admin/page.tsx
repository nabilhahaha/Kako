import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getPlatformContext, hasPlatformPermission } from '@/lib/erp/platform-context';
import { hasPermission } from '@/lib/erp/permissions';
import { ADMIN_NAV_TREE_ENABLED } from '@/lib/role-governance';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { AdminNavTree } from './admin-nav-tree';
import type { NavType } from './nav-tree-actions';

export const dynamic = 'force-dynamic';

/**
 * Admin Center — the unified Navigation Tree launcher (additive, default-OFF via
 * KAKO_ADMIN_NAV_TREE). Left = persistent role-aware tree across admin entity
 * types; selecting a node opens that entity's existing Workbench. Reuses existing
 * loaders/workbenches; no business-logic / permission / RLS / workflow change.
 */
export default async function AdminCenterPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const isAdmin = ctx.isPlatformOwner === true || ctx.isSuperAdmin === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!ADMIN_NAV_TREE_ENABLED() || !isAdmin) redirect('/settings');

  const pctx = await getPlatformContext();
  const companyAdmin = ctx.isPlatformOwner === true || ctx.memberships.some((m) => m.role === 'admin');
  const allowedTypes: NavType[] = [];
  if (hasPlatformPermission(pctx, 'view_companies')) allowedTypes.push('company');
  if (ctx.isSuperAdmin) allowedTypes.push('user');
  if (companyAdmin && ctx.companyId) allowedTypes.push('role');
  if (hasPermission(ctx, 'settings.branches') || ctx.isSuperAdmin) allowedTypes.push('branch');
  if (companyAdmin) allowedTypes.push('feature');

  return (
    <div>
      <PageHeader title={t('adminWb.navTreeTitle')} />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside>
          <AdminNavTree allowedTypes={allowedTypes} />
        </aside>
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">{t('adminWb.navPrompt')}</CardContent>
        </Card>
      </div>
    </div>
  );
}
