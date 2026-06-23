import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';

/**
 * PKG-2 — Field Verification landing. Routes the user to the most relevant page for
 * their role: admin → setup, field rep → my nearby customers, otherwise → reports.
 */
export default async function FieldVerificationPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (hasPermission(ctx, 'field_verification.admin')) redirect('/field-verification/setup');
  if (hasPermission(ctx, 'field_verification.verify')) redirect('/field-verification/my-customers');
  if (hasPermission(ctx, 'field_verification.reports')) redirect('/field-verification/reports');
  redirect('/dashboard');
}
