import { requireModule } from '@/lib/erp/guards';

export default async function CustomersModuleLayout({ children }: { children: React.ReactNode }) {
  await requireModule('sales');
  return <>{children}</>;
}
