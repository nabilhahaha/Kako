import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasAnyPermission } from '@/lib/erp/permissions';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { FormBuilder } from '@/app/(app)/distribution/route-planner/form-builder';

export const metadata: Metadata = { title: 'VANTORA — Form Builder' };

/**
 * Multi-Form Field Work → Form Builder (admin). Two-pane builder + live preview for a custom
 * form. Reuses erp_forms + erp_form_versions (draft → publish, versioned). Gated by
 * field_verification.admin (forms.admin added in PR-9) + the KAKO_FORM_BUILDER flag. The core
 * Field Verification form is never edited here. fv-theme = Navy + Electric Blue surface.
 */
export default async function FvFormEditPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasAnyPermission(ctx, ['forms.admin', 'field_verification.admin'])) redirect('/dashboard');
  if (!FORM_BUILDER_ENABLED()) redirect('/field-verification/setup');
  return (
    <div className="fv-theme mx-auto max-w-6xl p-4">
      <FormBuilder formId={formId} />
    </div>
  );
}
