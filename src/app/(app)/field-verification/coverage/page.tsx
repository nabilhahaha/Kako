import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { CoverageMap } from '@/app/(app)/distribution/route-planner/coverage-map';

export const metadata: Metadata = { title: 'VANTORA — Coverage Map' };

/**
 * Field Verification → Reports → Coverage Map. A read-only management dashboard: a large map of
 * the company's customers (green = visited, red = not visited), KPI cards and filters, with a
 * customer detail panel (desktop side panel / mobile bottom sheet). Gated by
 * field_verification.reports; all data + scope come from the SECURITY DEFINER erp_fv_coverage
 * RPC (admin all / viewer company-wide / supervisor temporarily company-wide). Read-only —
 * no submit / radius / photo / customer-list changes.
 */
export default async function FvCoveragePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field_verification.reports')) redirect('/dashboard');
  return <CoverageMap />;
}
