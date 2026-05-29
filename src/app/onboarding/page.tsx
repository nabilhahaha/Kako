import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  // Already set up (or platform staff) → no onboarding needed.
  if (ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.memberships.length > 0) {
    redirect('/dashboard');
  }
  return <OnboardingForm />;
}
