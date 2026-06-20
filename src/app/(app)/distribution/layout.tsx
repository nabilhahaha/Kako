import { requireModule } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';

export default async function DistributionLayout({ children }: { children: React.ReactNode }) {
  // Distribution tools are only for field-distribution tenants (general /
  // wholesale / delivery). Non-distribution companies are redirected away.
  //
  // EXCEPTION: standalone Route Planner product accounts reach /distribution/route-planner
  // but are NOT full distribution tenants — their plan (route_planner_*) does not include
  // the distribution module, and they must not hit the "module not enabled / upgrade"
  // screen. The Route Planner page enforces its own access, so let the experience through.
  const ctx = await getUserContext();
  if (!ctx?.isRoutePlannerExperience) {
    await requireModule('distribution');
  }
  return <>{children}</>;
}
