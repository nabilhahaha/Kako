import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasAnyPermission } from '@/lib/erp/permissions';
import { PosReports } from './pos-reports';

export const metadata: Metadata = { title: 'VANTORA — POS Reports' };

/**
 * Fast Food POS — sales reports (read-only). Self-gated on reports.view OR restaurant.manage
 * so reporting roles (supervisor/viewer) reach it WITHOUT the restaurant operational gate,
 * while admin/manager/cashier (restaurant.manage) also see it. Company-scoped data via RLS.
 */
export default async function PosReportsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasAnyPermission(ctx, ['reports.view', 'restaurant.manage'])) redirect('/dashboard');
  // Theme comes from the POS shell; this back-office page just needs its own padding.
  return <div className="p-4 sm:p-6"><PosReports /></div>;
}
