import { requireAnyModule } from '@/lib/erp/guards';

export default async function InventoryModuleLayout({ children }: { children: React.ReactNode }) {
  // Shared by the generic Inventory module and the Fashion store pack — the
  // operational pages (count/adjustments/movements/variance) serve both, so a
  // clothing tenant (fashion-only module) can reach them too.
  await requireAnyModule(['inventory', 'fashion']);
  return <>{children}</>;
}
