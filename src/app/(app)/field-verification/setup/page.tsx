import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { VerificationAdminPanel } from '@/app/(app)/distribution/route-planner/verification-admin-panel';
import { VerificationFormPanel } from '@/app/(app)/distribution/route-planner/verification-form-panel';

export const metadata: Metadata = { title: 'VANTORA — Field Verification Setup' };

/**
 * PKG-2 — standalone Field Verification admin setup (upload · assign · catalog ·
 * radius). Reuses the existing VerificationAdminPanel (no logic change). The panel's
 * sections carry ids (#fv-upload / #fv-assign / #fv-catalog / #fv-radius) so the
 * sidebar sub-items deep-link into them. The Form Builder panel (#fv-form) is shown only
 * when KAKO_FORM_BUILDER is enabled. Admin-gated.
 */
export default async function FvSetupPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field_verification.admin')) redirect('/dashboard');
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-lg font-extrabold">Field Verification Setup</h1>
      <VerificationAdminPanel />
      {FORM_BUILDER_ENABLED() && <VerificationFormPanel />}
    </div>
  );
}
