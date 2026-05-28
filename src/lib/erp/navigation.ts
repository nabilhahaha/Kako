import type { BranchRole } from './types';
import {
  LayoutDashboard,
  Building2,
  Users,
  Package,
  Boxes,
  ArrowLeftRight,
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
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. Empty = everyone. */
  roles?: BranchRole[];
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
    items: [
      { label: 'لوحة التحكم', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'المبيعات',
    items: [
      {
        label: 'بيع سريع',
        href: '/sales/pos',
        icon: Zap,
        roles: ['admin', 'manager', 'salesman', 'cashier'],
      },
      {
        label: 'أوامر البيع',
        href: '/sales/orders',
        icon: ShoppingCart,
        roles: ['admin', 'manager', 'salesman', 'cashier'],
      },
      {
        label: 'الفواتير',
        href: '/sales/invoices',
        icon: FileText,
        roles: ['admin', 'manager', 'salesman', 'cashier', 'accountant'],
      },
      {
        label: 'العملاء',
        href: '/customers',
        icon: Users,
        roles: ['admin', 'manager', 'salesman'],
      },
    ],
  },
  {
    title: 'المخزون',
    items: [
      {
        label: 'المنتجات',
        href: '/products',
        icon: Package,
        roles: ['admin', 'manager', 'warehouse_keeper'],
      },
      {
        label: 'أرصدة المخزون',
        href: '/inventory',
        icon: Boxes,
        roles: ['admin', 'manager', 'warehouse_keeper', 'salesman'],
      },
      {
        label: 'التحويلات',
        href: '/inventory/transfers',
        icon: ArrowLeftRight,
        roles: ['admin', 'manager', 'warehouse_keeper'],
      },
      {
        label: 'المخازن',
        href: '/warehouses',
        icon: Warehouse,
        roles: ['admin', 'manager', 'warehouse_keeper'],
      },
    ],
  },
  {
    title: 'المشتريات',
    items: [
      {
        label: 'الموردين',
        href: '/suppliers',
        icon: Truck,
        roles: ['admin', 'manager', 'accountant'],
      },
      {
        label: 'أوامر الشراء',
        href: '/purchases/orders',
        icon: Receipt,
        roles: ['admin', 'manager', 'warehouse_keeper'],
      },
    ],
  },
  {
    title: 'الحسابات',
    items: [
      {
        label: 'شجرة الحسابات',
        href: '/accounting/chart',
        icon: Tags,
        roles: ['admin', 'manager', 'accountant'],
      },
      {
        label: 'سندات الصرف والقبض',
        href: '/accounting/vouchers',
        icon: ReceiptText,
        roles: ['admin', 'manager', 'accountant', 'cashier'],
      },
      {
        label: 'القيود اليومية',
        href: '/accounting/journal',
        icon: Wallet,
        roles: ['admin', 'manager', 'accountant'],
      },
      {
        label: 'التقارير المالية',
        href: '/accounting/reports',
        icon: BarChart3,
        roles: ['admin', 'manager', 'accountant'],
      },
    ],
  },
  {
    title: 'الإعدادات',
    items: [
      {
        label: 'الفروع',
        href: '/settings/branches',
        icon: Building2,
        superAdminOnly: true,
      },
      {
        label: 'المستخدمون',
        href: '/settings/users',
        icon: Users,
        superAdminOnly: true,
      },
    ],
  },
];

/** Filter nav by role / super-admin status. */
export function visibleSections(
  topRole: BranchRole,
  isSuperAdmin: boolean,
): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.superAdminOnly) return isSuperAdmin;
      if (isSuperAdmin) return true;
      if (!item.roles || item.roles.length === 0) return true;
      return item.roles.includes(topRole);
    }),
  })).filter((section) => section.items.length > 0);
}
