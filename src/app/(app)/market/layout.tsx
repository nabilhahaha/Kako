import { requirePermission } from '@/lib/erp/guards';

export default async function MarketLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('market.pos');
  return <>{children}</>;
}
