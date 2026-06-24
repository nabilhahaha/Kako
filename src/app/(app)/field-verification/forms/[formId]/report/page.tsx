import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasAnyPermission } from '@/lib/erp/permissions';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { FormReportPanel } from '@/app/(app)/distribution/route-planner/form-report-panel';

export const metadata: Metadata = { title: 'VANTORA — Form Report' };

/**
 * Multi-Form Field Work → Single Form Report. A form's submissions with filters + a detail
 * drawer (answers rendered via the submit-time version, photos for authorized viewers, GPS/radius).
 * Gated by field_verification.reports + KAKO_FORM_BUILDER. fv-theme. Read-only; FV untouched.
 */
export default async function FvFormReportPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasAnyPermission(ctx, ['forms.reports', 'field_verification.reports'])) redirect('/dashboard');
  if (!FORM_BUILDER_ENABLED()) redirect('/field-verification/reports');
  return (
    <div className="fv-theme mx-auto max-w-5xl p-4">
      <FormReportPanel formId={formId} />
    </div>
  );
}
