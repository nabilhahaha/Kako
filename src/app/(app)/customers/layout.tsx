import { requireAnyModule } from '@/lib/erp/guards';

export default async function CustomersModuleLayout({ children }: { children: React.ReactNode }) {
  // Shared by the generic sales module and the Fashion store pack (statements +
  // opening balances), so a clothing tenant can reach them too.
  await requireAnyModule(['sales', 'fashion']);
  return <>{children}</>;
}
