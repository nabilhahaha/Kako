import { requireModule } from '@/lib/erp/guards';

export default async function AccountingModuleLayout({ children }: { children: React.ReactNode }) {
  await requireModule('accounting');
  return <>{children}</>;
}
