import { notFound, redirect } from 'next/navigation';
import { isSyncEnabledServer } from '@/lib/sync/flag';
import { getUserContext } from '@/lib/erp/auth-context';
import { SyncConsole } from '@/components/sync/sync-console';

export const dynamic = 'force-dynamic';

// Admin "Sync" console. Only exists when KAKO_SYNC is enabled — 404 otherwise, so
// it is invisible/inert in the current production app.
export default async function SyncSettingsPage() {
  if (!isSyncEnabledServer()) notFound();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (ctx.topRole !== 'admin' && !ctx.isSuperAdmin) notFound();
  return <SyncConsole userId={ctx.userId} companyId={ctx.companyId} />;
}
