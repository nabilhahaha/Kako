import { requirePermission } from '@/lib/erp/guards';

export default async function HotelLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('hotel.manage');
  return <>{children}</>;
}
