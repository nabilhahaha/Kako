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
  Crown,
  ScrollText,
  AlertTriangle,
  Clock,
  BedDouble,
  Stethoscope,
  UtensilsCrossed,
  ChefHat,
  LayoutGrid,
  Scissors,
  Pill,
  WashingMachine,
  Shirt,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission(s) required; visible if the user has ANY. Omit = everyone. */
  perm?: Permission | Permission[];
  /** Finer-grained module gate for this specific item (overrides the section's
   *  module). Lets a section like "المبيعات" hide POS/orders/returns for the
   *  business types that don't need them. Omit = use the section's module. */
  module?: Module;
  /** Only super admins. */
  superAdminOnly?: boolean;
  /** Only the platform owner (the vendor). */
  platformOwnerOnly?: boolean;
  /** Also show this item to the platform owner (who otherwise sees only the
   *  vendor panel + a few cross-tenant tools). */
  showForPlatformOwner?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
  /** Feature module this section belongs to; gated by the company's plan.
   *  Omit = always available (dashboard, settings, vendor panel). */
  module?: Module;
}

/** Feature modules that a subscription plan / business type can unlock.
 *  The four "core" modules (sales/inventory/purchasing/accounting) are what
 *  plans grant; the finer ones (pos, sales_orders, returns, warehousing) are
 *  item-level refinements driven by the business type so a clinic doesn't see
 *  POS and a restaurant doesn't see stock transfers. */
export type Module =
  | 'sales' | 'inventory' | 'purchasing' | 'accounting' | 'hotel' | 'clinic' | 'restaurant' | 'salon' | 'pharmacy' | 'laundry'
  | 'pos' | 'sales_orders' | 'returns' | 'warehousing';

/** The modules a subscription PLAN can grant (coarse). */
export const ALL_MODULES: Module[] = ['sales', 'inventory', 'purchasing', 'accounting', 'hotel', 'clinic', 'restaurant', 'salon', 'pharmacy', 'laundry'];

export const MODULE_LABELS: Record<Module, string> = {
  sales: 'المبيعات',
  inventory: 'المخزون',
  purchasing: 'المشتريات',
  accounting: 'الحسابات',
  hotel: 'الفندق',
  clinic: 'العيادة',
  restaurant: 'المطعم / الكافيه',
  salon: 'الصالون',
  pharmacy: 'الصيدلية',
  laundry: 'المغسلة',
  pos: 'نقطة البيع',
  sales_orders: 'أوامر البيع',
  returns: 'المرتجعات',
  warehousing: 'إدارة المخازن',
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'لوحة المزوّد',
    items: [
      { label: 'نظرة عامة', href: '/platform', icon: LayoutDashboard, platformOwnerOnly: true },
      { label: 'الشركات والاشتراكات', href: '/platform/companies', icon: Crown, platformOwnerOnly: true },
    ],
  },
  {
    title: 'الرئيسية',
    items: [{ label: 'لوحة التحكم', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'الفندق',
    module: 'hotel',
    items: [
      { label: 'الغرف', href: '/hotel/rooms', icon: BedDouble, perm: 'hotel.manage' },
      { label: 'الحجوزات', href: '/hotel/bookings', icon: CalendarDays, perm: 'hotel.manage' },
    ],
  },
  {
    title: 'العيادة',
    module: 'clinic',
    items: [
      { label: 'لوحة العيادة', href: '/clinic', icon: LayoutDashboard, perm: ['clinic.manage', 'clinic.reception', 'clinic.doctor'] },
      { label: 'الاستقبال', href: '/clinic/reception', icon: ClipboardCheck, perm: ['clinic.manage', 'clinic.reception'] },
      { label: 'الطبيب', href: '/clinic/doctor', icon: Stethoscope, perm: ['clinic.manage', 'clinic.doctor'] },
      { label: 'المواعيد', href: '/clinic/appointments', icon: CalendarClock, perm: ['clinic.manage', 'clinic.reception'] },
      { label: 'المرضى', href: '/clinic/patients', icon: Users, perm: ['clinic.manage', 'clinic.reception', 'clinic.doctor'] },
      { label: 'الكشوفات', href: '/clinic/visits', icon: ClipboardList, perm: 'clinic.manage' },
      { label: 'الخدمات والأسعار', href: '/clinic/services', icon: Tags, perm: 'clinic.manage' },
    ],
  },
  {
    title: 'المغسلة',
    module: 'laundry',
    items: [
      { label: 'لوحة المغسلة', href: '/laundry', icon: LayoutDashboard, perm: 'laundry.manage' },
      { label: 'الطلبات', href: '/laundry/orders', icon: WashingMachine, perm: 'laundry.manage' },
      { label: 'الأصناف والأسعار', href: '/laundry/services', icon: Shirt, perm: 'laundry.manage' },
    ],
  },
  {
    title: 'المطعم / الكافيه',
    module: 'restaurant',
    items: [
      { label: 'لوحة المطعم', href: '/restaurant', icon: LayoutDashboard, perm: 'restaurant.manage' },
      { label: 'الطاولات', href: '/restaurant/tables', icon: LayoutGrid, perm: 'restaurant.manage' },
      { label: 'الأوردرات', href: '/restaurant/orders', icon: UtensilsCrossed, perm: 'restaurant.manage' },
      { label: 'المطبخ', href: '/restaurant/kitchen', icon: ChefHat, perm: 'restaurant.manage' },
    ],
  },
  {
    title: 'الصالون / الكوافير',
    module: 'salon',
    items: [
      { label: 'لوحة الصالون', href: '/salon', icon: LayoutDashboard, perm: 'salon.manage' },
      { label: 'المواعيد', href: '/salon/appointments', icon: CalendarClock, perm: 'salon.manage' },
      { label: 'التذاكر', href: '/salon/tickets', icon: Scissors, perm: 'salon.manage' },
      { label: 'الخدمات والأسعار', href: '/salon/services', icon: Tags, perm: 'salon.manage' },
    ],
  },
  {
    title: 'الصيدلية',
    module: 'pharmacy',
    items: [
      { label: 'سجل صرف الأدوية', href: '/pharmacy/dispense', icon: Pill, perm: 'pharmacy.dispense' },
      { label: 'قرب انتهاء الصلاحية', href: '/inventory/expiry', icon: CalendarClock, perm: 'pharmacy.dispense' },
    ],
  },
  {
    title: 'المبيعات',
    module: 'sales',
    items: [
      { label: 'بيع سريع', href: '/sales/pos', icon: Zap, perm: 'sales.sell', module: 'pos' },
      { label: 'تطبيق المندوب', href: '/rep', icon: Smartphone, perm: 'field.sales' },
      { label: 'محاسبة المندوب اليومية', href: '/sales/settlement', icon: Wallet, perm: ['field.sales', 'reports.view'] },
      { label: 'أوامر البيع', href: '/sales/orders', icon: ShoppingCart, perm: 'sales.sell', module: 'sales_orders' },
      { label: 'الفواتير', href: '/sales/invoices', icon: FileText, perm: ['sales.sell', 'sales.collect'] },
      { label: 'خطة الزيارات', href: '/sales/journey', icon: CalendarDays, perm: 'field.sales' },
      { label: 'مرتجعات المبيعات', href: '/sales/returns', icon: Undo2, perm: 'sales.return', module: 'returns' },
      { label: 'تقرير المبيعات', href: '/sales/report', icon: BarChart3, perm: 'reports.view' },
      { label: 'العملاء', href: '/customers', icon: Users, perm: 'customers.manage' },
    ],
  },
  {
    title: 'المخزون',
    module: 'inventory',
    items: [
      { label: 'المنتجات', href: '/products', icon: Package, perm: 'inventory.view' },
      { label: 'أرصدة المخزون', href: '/inventory', icon: Boxes, perm: 'inventory.view' },
      { label: 'تنبيهات نقص المخزون', href: '/inventory/low-stock', icon: AlertTriangle, perm: 'inventory.view' },
      { label: 'التحويلات', href: '/inventory/transfers', icon: ArrowLeftRight, perm: 'inventory.transfer', module: 'warehousing' },
      { label: 'طلبات التحميل', href: '/inventory/requests', icon: ClipboardCheck, perm: ['stock_request.create', 'stock_request.approve'], module: 'warehousing' },
      { label: 'الجرد', href: '/inventory/count', icon: ClipboardList, perm: 'inventory.count', module: 'warehousing' },
      { label: 'قرب انتهاء الصلاحية', href: '/inventory/expiry', icon: CalendarClock, perm: 'inventory.view' },
      { label: 'المخازن', href: '/warehouses', icon: Warehouse, perm: 'inventory.view', module: 'warehousing' },
    ],
  },
  {
    title: 'المشتريات',
    module: 'purchasing',
    items: [
      { label: 'الموردين', href: '/suppliers', icon: Truck, perm: 'suppliers.manage' },
      { label: 'أوامر الشراء', href: '/purchases/orders', icon: Receipt, perm: 'purchasing.manage' },
    ],
  },
  {
    title: 'الحسابات',
    module: 'accounting',
    items: [
      { label: 'شجرة الحسابات', href: '/accounting/chart', icon: Tags, perm: 'accounting.view' },
      { label: 'سندات الصرف والقبض', href: '/accounting/vouchers', icon: ReceiptText, perm: 'accounting.post' },
      { label: 'القيود اليومية', href: '/accounting/journal', icon: Wallet, perm: 'accounting.view' },
      { label: 'التقارير المالية', href: '/accounting/reports', icon: BarChart3, perm: 'accounting.view' },
      { label: 'أعمار ديون العملاء', href: '/accounting/aging', icon: Clock, perm: ['accounting.view', 'reports.view'] },
      { label: 'تصدير البيانات', href: '/exports', icon: Download, perm: ['accounting.view', 'reports.view'] },
    ],
  },
  {
    title: 'الإعدادات',
    items: [
      { label: 'الفروع', href: '/settings/branches', icon: Building2, superAdminOnly: true },
      { label: 'المستخدمون', href: '/settings/users', icon: Users, superAdminOnly: true },
      { label: 'فريق العمل', href: '/settings/staff', icon: UserCog, perm: 'settings.users' },
      { label: 'الصلاحيات', href: '/settings/permissions', icon: ShieldCheck, superAdminOnly: true },
      { label: 'سجل التدقيق', href: '/platform/audit', icon: ScrollText, superAdminOnly: true, showForPlatformOwner: true },
      { label: 'حسابي', href: '/account', icon: UserCog, showForPlatformOwner: true },
    ],
  },
];

/** Filter nav by the user's effective permissions / super-admin status and the
 *  feature modules unlocked by the company's plan. An empty `modules` list means
 *  "no module restriction" (safe fallback for platform owner / legacy tenants). */
export function visibleSections(
  permissions: Permission[],
  isSuperAdmin: boolean,
  isPlatformOwner = false,
  modules: Module[] = [],
): NavSection[] {
  const has = (perm: Permission | Permission[]) =>
    Array.isArray(perm) ? perm.some((p) => permissions.includes(p)) : permissions.includes(perm);

  // The platform owner (the vendor) runs the platform; they belong to no tenant
  // company and must NOT see tenant-operational sections (sales, inventory,
  // hotel, …). They see only the vendor panel + a few cross-tenant tools
  // explicitly flagged with platformOwnerOnly / showForPlatformOwner.
  if (isPlatformOwner) {
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => item.platformOwnerOnly || item.showForPlatformOwner),
    })).filter((section) => section.items.length > 0);
  }

  const elevated = isSuperAdmin;
  const unrestricted = modules.length === 0; // platform owner / legacy tenant
  const moduleAllowed = (m?: Module) => !m || unrestricted || modules.includes(m);

  return NAV_SECTIONS.filter((s) => moduleAllowed(s.module)).map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.platformOwnerOnly) return false; // vendor-only, hidden from tenants
      // finer per-item module gate (e.g. POS / sales orders / warehousing)
      if (!moduleAllowed(item.module)) return false;
      if (item.superAdminOnly) return elevated;
      if (elevated) return true;
      if (!item.perm) return true;
      return has(item.perm);
    }),
  })).filter((section) => section.items.length > 0);
}
