import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  // Route Planner product accounts must never be trapped in tenant onboarding — they have
  // their own destinations. This page is a top-level route (outside the (app) layout’s
  // short-circuit), so guard it explicitly.
  if (ctx.isRoutePlannerAdmin) redirect('/planner-admin');
  if (ctx.isRoutePlannerExperience) redirect('/distribution/route-planner');
  // Already set up (or platform staff) → no onboarding needed.
  if (ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.memberships.length > 0) {
    redirect('/dashboard');
  }
  return <OnboardingForm />;
}
