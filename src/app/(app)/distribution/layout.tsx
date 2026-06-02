import { requireModule } from '@/lib/erp/guards';

export default async function DistributionLayout({ children }: { children: React.ReactNode }) {
  // Distribution tools are only for field-distribution tenants (general /
  // wholesale / delivery). Non-distribution companies are redirected away.
  await requireModule('distribution');
  return <>{children}</>;
}
