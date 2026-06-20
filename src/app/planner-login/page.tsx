import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { resolveHomePath } from '@/lib/erp/home';
import { PlannerLoginForm } from './planner-login-form';

export const metadata: Metadata = { title: 'VANTORA Route Planner — Sign in' };

/**
 * Standalone Route Planner sign-in. Lives outside the (app) shell so it carries none
 * of the ERP chrome. Already-authenticated users are routed to their home (the planner
 * for demo/planner users, the admin console for the Route Planner Admin). The normal
 * /login experience is left untouched.
 */
export default async function PlannerLoginPage() {
  const ctx = await getUserContext();
  if (ctx) redirect(resolveHomePath(ctx));
  return <PlannerLoginForm />;
}
