import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { FormsDashboardPanel } from '@/app/(app)/distribution/route-planner/forms-dashboard-panel';

export const metadata: Metadata = { title: 'VANTORA — Forms Reports' };

/**
 * Multi-Form Field Work → Forms Reports (overview + cross-form). Per-form rollups and a
 * cross-form table across all custom forms. Gated by field_verification.reports +
 * KAKO_FORM_BUILDER. fv-theme. Read-only; Field Verification reporting untouched.
 */
export default async function FvFormsReportsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field_verification.reports')) redirect('/dashboard');
  if (!FORM_BUILDER_ENABLED()) redirect('/field-verification/reports');
  return (
    <div className="fv-theme mx-auto max-w-5xl p-4">
      <FormsDashboardPanel />
    </div>
  );
}
