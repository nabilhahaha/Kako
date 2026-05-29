import { requireModule } from '@/lib/erp/guards';

export default async function ProductsModuleLayout({ children }: { children: React.ReactNode }) {
  await requireModule('inventory');
  return <>{children}</>;
}
