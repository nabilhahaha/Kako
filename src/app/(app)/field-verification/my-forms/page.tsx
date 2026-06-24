import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { MyFormsPanel } from '@/app/(app)/distribution/route-planner/my-forms-panel';

export const metadata: Metadata = { title: 'VANTORA — My Forms' };

/**
 * Multi-Form Field Work → My Forms (rep). Lists the published custom forms assigned to the
 * caller. The Field Verification flow stays at /field-verification/my-customers (unchanged).
 * Gated by field_verification.verify + KAKO_FORM_BUILDER. fv-theme surface.
 */
export default async function FvMyFormsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field_verification.verify')) redirect('/dashboard');
  if (!FORM_BUILDER_ENABLED()) redirect('/field-verification/my-customers');
  return (
    <div className="fv-theme p-4">
      <MyFormsPanel />
    </div>
  );
}
