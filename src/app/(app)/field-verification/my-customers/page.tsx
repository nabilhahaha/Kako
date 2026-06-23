import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { MyNearbyCustomers } from '@/app/(app)/distribution/route-planner/my-nearby-customers';

export const metadata: Metadata = { title: 'VANTORA — My Nearby Customers' };

/**
 * PKG-2 — standalone Field Verification route. Reuses the FV-5 rep mobile panel
 * (no logic change). Gated by the `field_verification` module (auto-enforced via
 * the route-URL guard) + the field_verification.verify permission.
 */
export default async function FvMyCustomersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field_verification.verify')) redirect('/dashboard');
  return <MyNearbyCustomers />;
}
