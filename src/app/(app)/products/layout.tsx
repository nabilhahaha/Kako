import { requireAnyModule } from '@/lib/erp/guards';

export default async function ProductsModuleLayout({ children }: { children: React.ReactNode }) {
  // The product catalog backs both the generic Inventory module and the Fashion
  // store pack (variants are catalog rows), so a clothing tenant may edit here too.
  await requireAnyModule(['inventory', 'fashion']);
  return <>{children}</>;
}
