import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { StudioWorkspace } from '../studio/studio-workspace';

/**
 * New Optimization — a standalone, permission-gated optimization SESSION:
 * Excel/CSV in → preview → constraints → optimize → review (map · route · day ·
 * salesman) → drag & drop → Excel/CSV out. Temporary dataset only; it never reads
 * or writes live company data. Access is by the `tis.run_optimization` permission
 * (NOT role-based) — any user granted it sees this, regardless of role.
 *
 * Reuses the shared planning engines + the Studio surface in "session" mode
 * (opens on Import, Simple Mode by default).
 */
export default async function NewOptimizationPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'tis.run_optimization')) redirect('/dashboard');

  const { t } = await getT();
  return (
    <div>
      <PageHeader title={t('studio.newOptTitle')} description={t('studio.newOptDesc')} />
      <StudioWorkspace customers={[]} asOf={new Date().toISOString().slice(0, 10)} source="upload" demo={false} mode="session" initialStage="import" />
    </div>
  );
}
