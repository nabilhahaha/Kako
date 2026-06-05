import { requireAnyModule } from '@/lib/erp/guards';

export default async function SuppliersModuleLayout({ children }: { children: React.ReactNode }) {
  // Shared by the generic purchasing module and the Fashion store pack (statements +
  // opening balances), so a clothing tenant can reach them too.
  await requireAnyModule(['purchasing', 'fashion']);
  return <>{children}</>;
}
