import { requireModule } from '@/lib/erp/guards';

export default async function WarehousesModuleLayout({ children }: { children: React.ReactNode }) {
  await requireModule('inventory');
  return <>{children}</>;
}
