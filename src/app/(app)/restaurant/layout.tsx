import { requirePermission } from '@/lib/erp/guards';

export default async function RestaurantLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('restaurant.manage');
  return <>{children}</>;
}
