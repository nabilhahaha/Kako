import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { FormRunner } from '@/app/(app)/distribution/route-planner/form-runner';

export const metadata: Metadata = { title: 'VANTORA — Form' };

/**
 * Multi-Form Field Work → form runner (rep). Renders an assigned, published form and submits one
 * immutable response. Re-gated server-side in the actions. Gated by field_verification.verify +
 * KAKO_FORM_BUILDER. fv-theme surface. FV verification flow untouched.
 */
export default async function FvFormRunnerPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field_verification.verify')) redirect('/dashboard');
  if (!FORM_BUILDER_ENABLED()) redirect('/field-verification/my-customers');
  return (
    <div className="fv-theme">
      <FormRunner formId={formId} />
    </div>
  );
}
