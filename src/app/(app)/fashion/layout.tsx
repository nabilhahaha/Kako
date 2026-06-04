import { requireAnyPermission } from '@/lib/erp/guards';

/** Any fashion role may enter the pack; each page/action re-checks its own
 *  granular `fashion.*` permission. */
export default async function FashionLayout({ children }: { children: React.ReactNode }) {
  await requireAnyPermission([
    'fashion.manage', 'fashion.sell', 'fashion.inventory',
    'fashion.purchase', 'fashion.installments', 'fashion.cashbox', 'fashion.reports',
  ]);
  return <>{children}</>;
}
