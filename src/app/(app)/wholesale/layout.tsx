import { requirePermission } from '@/lib/erp/guards';

export default async function WholesaleLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('wholesale.pricing');
  return <>{children}</>;
}
