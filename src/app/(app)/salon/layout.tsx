import { requirePermission } from '@/lib/erp/guards';

export default async function SalonLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('salon.manage');
  return <>{children}</>;
}
