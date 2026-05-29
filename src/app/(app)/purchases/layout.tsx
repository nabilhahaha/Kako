import { requireModule } from '@/lib/erp/guards';

export default async function PurchasesModuleLayout({ children }: { children: React.ReactNode }) {
  await requireModule('purchasing');
  return <>{children}</>;
}
