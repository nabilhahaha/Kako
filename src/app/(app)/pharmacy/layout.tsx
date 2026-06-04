import { requirePermission } from '@/lib/erp/guards';

export default async function PharmacyLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('pharmacy.dispense');
  return <>{children}</>;
}
