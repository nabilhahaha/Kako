import { requireModule } from '@/lib/erp/guards';

export default async function ExportsModuleLayout({ children }: { children: React.ReactNode }) {
  await requireModule('accounting');
  return <>{children}</>;
}
