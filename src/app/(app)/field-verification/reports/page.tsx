import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { VerificationReportsPanel } from '@/app/(app)/distribution/route-planner/verification-reports-panel';

export const metadata: Metadata = { title: 'VANTORA — Verification Reports' };

/**
 * PKG-2 — standalone Field Verification reports + Excel export. Reuses the existing
 * VerificationReportsPanel (no logic change). Gated by field_verification.reports;
 * row visibility stays RLS-scoped server-side (admin all / supervisor team / rep own).
 */
export default async function FvReportsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field_verification.reports')) redirect('/dashboard');
  return (
    <div className="fv-theme mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-lg font-extrabold">Field Verification Reports</h1>
      <VerificationReportsPanel />
    </div>
  );
}
