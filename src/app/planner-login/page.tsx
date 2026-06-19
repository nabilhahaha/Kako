import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { PlannerLoginForm } from './planner-login-form';

export const metadata: Metadata = { title: 'VANTORA Route Planner — Sign in' };

/**
 * Standalone Route Planner sign-in. Lives outside the (app) shell so it carries none
 * of the ERP chrome. Already-authenticated users skip straight to the planner. The
 * normal /login experience is left untouched.
 */
export default async function PlannerLoginPage() {
  const ctx = await getUserContext();
  if (ctx) redirect('/distribution/route-planner');
  return <PlannerLoginForm />;
}
