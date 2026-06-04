import { requirePermission } from '@/lib/erp/guards';

export default async function LaundryLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('laundry.manage');
  return <>{children}</>;
}
