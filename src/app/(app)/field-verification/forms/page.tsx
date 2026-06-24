import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { FormsLibraryPanel } from '@/app/(app)/distribution/route-planner/forms-library-panel';

export const metadata: Metadata = { title: 'VANTORA — Forms Library' };

/**
 * Multi-Form Field Work → Forms Library (admin). Create/manage multiple custom field-work
 * forms on top of the existing 0240 forms backbone. The core Field Verification form is shown
 * as a locked card linking to its existing Setup — never editable here. Gated by
 * field_verification.admin (forms.admin is added in PR-9) + the KAKO_FORM_BUILDER flag.
 * fv-theme = the approved Navy + Electric Blue surface theme.
 */
export default async function FvFormsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field_verification.admin')) redirect('/dashboard');
  if (!FORM_BUILDER_ENABLED()) redirect('/field-verification/setup');
  return (
    <div className="fv-theme mx-auto max-w-5xl p-4">
      <FormsLibraryPanel />
    </div>
  );
}
