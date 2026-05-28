import type { Permission } from './permissions';
import {
  LayoutDashboard,
  Building2,
  Users,
  Package,
  Boxes,
  ArrowLeftRight,
  CalendarClock,
  ClipboardList,
  ClipboardCheck,
  Warehouse,
  ShoppingCart,
  FileText,
  Wallet,
  Truck,
  BarChart3,
  Receipt,
  ReceiptText,
  Tags,
  Zap,
  Undo2,
  UserCog,
  Smartphone,
  ShieldCheck,
  CalendarDays,
  Download,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission(s) required; visible if the user has ANY. Omit = everyone. */
  perm?: Permission | Permission[];
  /** Only super admins. */
  superAdminOnly?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'الرئيسية',
    items: [{ label: 'لوحة التحكم', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'المبيعات',
    items: [
      { label: 'بيع سريع', href: '/sales/pos', icon: Zap, perm: 'sales.sell' },
      { label: 'تطبيق المندوب', href: '/rep', icon: Smartphone, perm: 'sales.sell' },
      { label: 'محاسبة المندوب اليومية', href: '/sales/settlement', icon: Wallet, perm: ['sales.collect', 'reports.view'] },
      { label: 'أوامر البيع', href: '/sales/orders', icon: ShoppingCart, perm: 'sales.sell' },
      { label: 'الفواتير', href: '/sales/invoices', icon: FileText, perm: ['sales.sell', 'sales.collect'] },
      { label: 'خطة الزيارات', href: '/sales/journey', icon: CalendarDays, perm: 'customers.manage' },
      { label: 'مرتجعات المبيعات', href: '/sales/returns', icon: Undo2, perm: 'sales.return' },
      { label: 'تقرير المبيعات', href: '/sales/report', icon: BarChart3, perm: 'reports.view' },
      { label: 'العملاء', href: '/customers', icon: Users, perm: 'customers.manage' },
    ],
  },
  {
    title: 'المخزون',
    items: [
      { label: 'المنتجات', href: '/products', icon: Package, perm: 'inventory.view' },
      { label: 'أرصدة المخزون', href: '/inventory', icon: Boxes, perm: 'inventory.view' },
      { label: 'التحويلات', href: '/inventory/transfers', icon: ArrowLeftRight, perm: 'inventory.transfer' },
      { label: 'طلبات التحميل', href: '/inventory/requests', icon: ClipboardCheck, perm: ['stock_request.create', 'stock_request.approve'] },
      { label: 'الجرد', href: '/inventory/count', icon: ClipboardList, perm: 'inventory.count' },
      { label: 'قرب انتهاء الصلاحية', href: '/inventory/expiry', icon: CalendarClock, perm: 'inventory.view' },
      { label: 'المخازن', href: '/warehouses', icon: Warehouse, perm: 'inventory.view' },
    ],
  },
  {
    title: 'المشتريات',
    items: [
      { label: 'الموردين', href: '/suppliers', icon: Truck, perm: 'suppliers.manage' },
      { label: 'أوامر الشراء', href: '/purchases/orders', icon: Receipt, perm: 'purchasing.manage' },
    ],
  },
  {
    title: 'الحسابات',
    items: [
      { label: 'شجرة الحسابات', href: '/accounting/chart', icon: Tags, perm: 'accounting.view' },
      { label: 'سندات الصرف والقبض', href: '/accounting/vouchers', icon: ReceiptText, perm: 'accounting.post' },
      { label: 'القيود اليومية', href: '/accounting/journal', icon: Wallet, perm: 'accounting.view' },
      { label: 'التقارير المالية', href: '/accounting/reports', icon: BarChart3, perm: 'accounting.view' },
      { label: 'تصدير البيانات', href: '/exports', icon: Download, perm: ['accounting.view', 'reports.view'] },
    ],
  },
  {
    title: 'الإعدادات',
    items: [
      { label: 'الفروع', href: '/settings/branches', icon: Building2, superAdminOnly: true },
      { label: 'المستخدمون', href: '/settings/users', icon: Users, superAdminOnly: true },
      { label: 'الصلاحيات', href: '/settings/permissions', icon: ShieldCheck, perm: 'settings.users' },
      { label: 'حسابي', href: '/account', icon: UserCog },
    ],
  },
];

/** Filter nav by the user's effective permissions / super-admin status. */
export function visibleSections(
  permissions: Permission[],
  isSuperAdmin: boolean,
): NavSection[] {
  const has = (perm: Permission | Permission[]) =>
    Array.isArray(perm) ? perm.some((p) => permissions.includes(p)) : permissions.includes(perm);

  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.superAdminOnly) return isSuperAdmin;
      if (isSuperAdmin) return true;
      if (!item.perm) return true;
      return has(item.perm);
    }),
  })).filter((section) => section.items.length > 0);
}
