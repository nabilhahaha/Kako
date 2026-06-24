import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { FormAssignmentsPanel } from '@/app/(app)/distribution/route-planner/form-assignments-panel';

export const metadata: Metadata = { title: 'VANTORA — Form Assignment' };

/**
 * Multi-Form Field Work → Form Assignment (admin). Choose who can use a form (user/role/
 * supervisor/team/branch) and which customers it applies to (dataset/city/channel). Writes
 * erp_form_assignments (0379). Gated by field_verification.admin + KAKO_FORM_BUILDER. fv-theme.
 */
export default async function FvFormAssignPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field_verification.admin')) redirect('/dashboard');
  if (!FORM_BUILDER_ENABLED()) redirect('/field-verification/setup');
  return (
    <div className="fv-theme mx-auto max-w-3xl p-4">
      <FormAssignmentsPanel formId={formId} />
    </div>
  );
}
