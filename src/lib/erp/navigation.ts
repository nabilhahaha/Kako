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
  ScanBarcode,
  Layers,
  Target,
  Network,
  Map,
  Cpu,
  Wrench,
  PackageCheck,
  ShieldQuestion,
  Upload,
  FileSpreadsheet,
  FileDown,
  CreditCard,
  SlidersHorizontal,
  GitBranch,
  Bell,
  Palette,
  Activity,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  /** i18n key (dot-path into `nav.items.*`), resolved with `t()` at render. */
  label: string;
  href: string;
  icon: LucideIcon;
  /** Optional subsection label (i18n key into `nav.groups.*`). When set, the
   *  sidebar renders a small group header above the first item of each group,
   *  so a long section (e.g. Settings) reads as labeled subsections. */
  group?: string;
  /** Permission(s) required; visible if the user has ANY. Omit = everyone. */
  perm?: Permission | Permission[];
  /** Finer-grained module gate for this specific item (overrides the section's
   *  module). Lets a section like "المبيعات" hide POS/orders/returns for the
   *  business types that don't need them. Omit = use the section's module.
   *  An array = ANY-of (visible if the company has *any* of the listed modules),
   *  used to bind a capability module alongside a legacy gate without regressing
   *  tenants that only have the legacy one (e.g. field_ops OR distribution). */
  module?: Module | Module[];
  /** Only super admins. */
  superAdminOnly?: boolean;
  /** Only the platform owner (the vendor). */
  platformOwnerOnly?: boolean;
  /** Visible to an internal employee holding this platform permission (the
   *  platform owner always sees it). Generic, vendor-side gating. */
  platformPerm?: string;
  /** Also show this item to the platform owner (who otherwise sees only the
   *  vendor panel + a few cross-tenant tools). */
  showForPlatformOwner?: boolean;
}

export interface NavSection {
  /** i18n key (dot-path into `nav.sections.*`), resolved with `t()` at render. */
  title: string;
  items: NavItem[];
  /** Feature module this section belongs to; gated by the company's plan.
   *  Omit = always available (dashboard, settings, vendor panel). An array =
   *  ANY-of (visible if the company has any of the listed modules). */
  module?: Module | Module[];
}

/** Feature modules that a subscription plan / business type can unlock.
 *  The four "core" modules (sales/inventory/purchasing/accounting) are what
 *  plans grant; the finer ones (pos, sales_orders, returns, warehousing) are
 *  item-level refinements driven by the business type so a clinic doesn't see
 *  POS and a restaurant doesn't see stock transfers. */
export type Module =
  | 'sales' | 'inventory' | 'purchasing' | 'accounting' | 'hotel' | 'clinic' | 'restaurant' | 'salon' | 'pharmacy' | 'laundry' | 'market' | 'wholesale' | 'distribution'
  | 'pos' | 'sales_orders' | 'returns' | 'warehousing'
  // Core (capability) modules — first-class licensable entitlements (R4B).
  | 'crm' | 'workflow' | 'analytics' | 'field_ops' | 'integrations';

/** The modules a subscription PLAN can grant (coarse). Core capability modules
 *  are included so they appear in the (grouped) Marketplace and are gateable. */
export const ALL_MODULES: Module[] = [
  'crm', 'sales', 'inventory', 'purchasing', 'accounting', 'pos', 'workflow', 'analytics', 'field_ops', 'integrations',
  'hotel', 'clinic', 'restaurant', 'salon', 'pharmacy', 'laundry', 'market', 'wholesale', 'distribution',
];

export const MODULE_LABELS: Record<Module, { en: string; ar: string }> = {
  crm: { en: 'CRM', ar: 'إدارة العملاء' },
  workflow: { en: 'Workflow & Approvals', ar: 'سير العمل والموافقات' },
  analytics: { en: 'Analytics', ar: 'التحليلات' },
  field_ops: { en: 'Field Operations', ar: 'العمليات الميدانية' },
  integrations: { en: 'Integrations', ar: 'التكاملات' },
  sales: { en: 'Sales', ar: 'المبيعات' },
  inventory: { en: 'Inventory', ar: 'المخزون' },
  purchasing: { en: 'Purchasing', ar: 'المشتريات' },
  accounting: { en: 'Finance / Accounting', ar: 'المالية / المحاسبة' },
  hotel: { en: 'Hotel', ar: 'الفندق' },
  clinic: { en: 'Clinic', ar: 'العيادة' },
  restaurant: { en: 'Restaurant / Café', ar: 'المطعم / الكافيه' },
  salon: { en: 'Salon', ar: 'الصالون' },
  pharmacy: { en: 'Pharmacy', ar: 'الصيدلية' },
  laundry: { en: 'Laundry', ar: 'المغسلة' },
  market: { en: 'Supermarket', ar: 'السوبر ماركت' },
  wholesale: { en: 'Wholesale', ar: 'الجملة' },
  distribution: { en: 'Distribution', ar: 'التوزيع' },
  pos: { en: 'Point of Sale', ar: 'نقطة البيع' },
  sales_orders: { en: 'Sales Orders', ar: 'أوامر البيع' },
  returns: { en: 'Returns', ar: 'المرتجعات' },
  warehousing: { en: 'Warehouse Management', ar: 'إدارة المخازن' },
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'nav.sections.provider',
    items: [
      { label: 'nav.items.overview', href: '/platform', icon: LayoutDashboard, platformOwnerOnly: true },
      { label: 'nav.items.activityFeed', href: '/platform/activity', icon: Activity, platformOwnerOnly: true },
      { label: 'nav.items.companies', href: '/platform/companies', icon: Crown, platformPerm: 'view_companies' },
      { label: 'nav.items.billing', href: '/platform/billing', icon: CreditCard, platformOwnerOnly: true },
      { label: 'nav.items.platformStaff', href: '/platform/staff', icon: UserCog, platformPerm: 'manage_users' },
      { label: 'nav.items.drugsList', href: '/platform/drugs', icon: Pill, platformOwnerOnly: true },
    ],
  },
  {
    title: 'nav.sections.main',
    items: [
      { label: 'nav.items.dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'nav.items.approvals', href: '/approvals', icon: ClipboardCheck, module: 'workflow' },
      { label: 'nav.items.notifications', href: '/notifications', icon: Bell },
    ],
  },
  {
    title: 'nav.sections.hotel',
    module: 'hotel',
    items: [
      { label: 'nav.items.hotelRooms', href: '/hotel/rooms', icon: BedDouble, perm: 'hotel.manage' },
      { label: 'nav.items.hotelBookings', href: '/hotel/bookings', icon: CalendarDays, perm: 'hotel.manage' },
    ],
  },
  {
    title: 'nav.sections.clinic',
    module: 'clinic',
    items: [
      { label: 'nav.items.clinicDashboard', href: '/clinic', icon: LayoutDashboard, perm: ['clinic.manage', 'clinic.reception', 'clinic.doctor'] },
      { label: 'nav.items.reception', href: '/clinic/reception', icon: ClipboardCheck, perm: ['clinic.manage', 'clinic.reception'] },
      { label: 'nav.items.doctor', href: '/clinic/doctor', icon: Stethoscope, perm: ['clinic.manage', 'clinic.doctor'] },
      { label: 'nav.items.appointments', href: '/clinic/appointments', icon: CalendarClock, perm: ['clinic.manage', 'clinic.reception'] },
      { label: 'nav.items.patients', href: '/clinic/patients', icon: Users, perm: ['clinic.manage', 'clinic.reception', 'clinic.doctor'] },
      { label: 'nav.items.visits', href: '/clinic/visits', icon: ClipboardList, perm: 'clinic.manage' },
      { label: 'nav.items.clinicReports', href: '/clinic/reports', icon: BarChart3, perm: ['clinic.manage', 'reports.view'] },
      { label: 'nav.items.services', href: '/clinic/services', icon: Tags, perm: 'clinic.manage' },
    ],
  },
  {
    title: 'nav.sections.wholesale',
    module: 'wholesale',
    items: [
      { label: 'nav.items.wholesaleOrder', href: '/wholesale/order', icon: FileText, perm: 'wholesale.pricing' },
      { label: 'nav.items.priceLevels', href: '/wholesale', icon: Layers, perm: 'wholesale.pricing' },
      { label: 'nav.items.priceList', href: '/wholesale/prices', icon: Tags, perm: 'wholesale.pricing' },
      { label: 'nav.items.customerLevels', href: '/wholesale/customers', icon: Users, perm: 'wholesale.pricing' },
    ],
  },
  {
    title: 'nav.sections.market',
    module: 'market',
    items: [
      { label: 'nav.items.cashier', href: '/market/pos', icon: ScanBarcode, perm: 'market.pos' },
    ],
  },
  {
    title: 'nav.sections.laundry',
    module: 'laundry',
    items: [
      { label: 'nav.items.laundryDashboard', href: '/laundry', icon: LayoutDashboard, perm: 'laundry.manage' },
      { label: 'nav.items.orders', href: '/laundry/orders', icon: WashingMachine, perm: 'laundry.manage' },
      { label: 'nav.items.laundryServices', href: '/laundry/services', icon: Shirt, perm: 'laundry.manage' },
    ],
  },
  {
    title: 'nav.sections.restaurant',
    module: 'restaurant',
    items: [
      { label: 'nav.items.restaurantDashboard', href: '/restaurant', icon: LayoutDashboard, perm: 'restaurant.manage' },
      { label: 'nav.items.tables', href: '/restaurant/tables', icon: LayoutGrid, perm: 'restaurant.manage' },
      { label: 'nav.items.restaurantOrders', href: '/restaurant/orders', icon: UtensilsCrossed, perm: 'restaurant.manage' },
      { label: 'nav.items.kitchen', href: '/restaurant/kitchen', icon: ChefHat, perm: 'restaurant.manage' },
    ],
  },
  {
    title: 'nav.sections.salon',
    module: 'salon',
    items: [
      { label: 'nav.items.salonDashboard', href: '/salon', icon: LayoutDashboard, perm: 'salon.manage' },
      { label: 'nav.items.appointments', href: '/salon/appointments', icon: CalendarClock, perm: 'salon.manage' },
      { label: 'nav.items.tickets', href: '/salon/tickets', icon: Scissors, perm: 'salon.manage' },
      { label: 'nav.items.services', href: '/salon/services', icon: Tags, perm: 'salon.manage' },
    ],
  },
  {
    title: 'nav.sections.pharmacy',
    module: 'pharmacy',
    items: [
      { label: 'nav.items.pharmacyDispense', href: '/pharmacy/dispense', icon: Pill, perm: 'pharmacy.dispense' },
      { label: 'nav.items.expiryNear', href: '/inventory/expiry', icon: CalendarClock, perm: 'pharmacy.dispense' },
    ],
  },
  {
    title: 'nav.sections.sales',
    // Any-of: the section shows if the company has Sales OR a capability whose
    // item lives here (CRM→Customers, Analytics→report, Field Ops→rep). Every
    // business type seeds `sales`, so this is identical to the old `sales` gate
    // in practice (no regression); each item's own module gate then refines.
    module: ['sales', 'crm', 'analytics', 'field_ops', 'distribution'],
    items: [
      { label: 'nav.items.quickSale', href: '/sales/pos', icon: Zap, perm: 'sales.sell', module: 'pos' },
      { label: 'nav.items.repApp', href: '/rep', icon: Smartphone, perm: 'field.sales', module: ['field_ops', 'distribution'] },
      { label: 'nav.items.repSettlement', href: '/sales/settlement', icon: Wallet, perm: ['field.sales', 'reports.view'], module: ['field_ops', 'distribution'] },
      { label: 'nav.items.salesOrders', href: '/sales/orders', icon: ShoppingCart, perm: 'sales.sell', module: 'sales_orders' },
      { label: 'nav.items.invoices', href: '/sales/invoices', icon: FileText, perm: ['sales.sell', 'sales.collect'] },
      { label: 'nav.items.pricing', href: '/sales/pricing', icon: Tags, perm: 'pricing.manage' },
      { label: 'nav.items.journey', href: '/sales/journey', icon: CalendarDays, perm: 'field.sales', module: ['field_ops', 'distribution'] },
      { label: 'nav.items.salesReturns', href: '/sales/returns', icon: Undo2, perm: 'sales.return', module: 'returns' },
      { label: 'nav.items.salesReport', href: '/sales/report', icon: BarChart3, perm: 'reports.view', module: ['analytics', 'sales'] },
      { label: 'nav.items.customers', href: '/customers', icon: Users, perm: 'customers.manage', module: ['crm', 'sales'] },
    ],
  },
  {
    title: 'nav.sections.distribution',
    module: 'distribution',
    items: [
      { label: 'nav.items.routes', href: '/distribution/routes', icon: Truck, perm: ['reports.view', 'customers.manage'] },
      { label: 'nav.items.distributionReport', href: '/distribution/report', icon: BarChart3, perm: 'reports.view' },
      { label: 'nav.items.repTargets', href: '/distribution/targets', icon: Target, perm: 'reports.view' },
    ],
  },
  {
    title: 'nav.sections.inventory',
    module: 'inventory',
    items: [
      { label: 'nav.items.products', href: '/products', icon: Package, perm: 'inventory.view' },
      { label: 'nav.items.stock', href: '/inventory', icon: Boxes, perm: 'inventory.view' },
      { label: 'nav.items.lowStockAlerts', href: '/inventory/low-stock', icon: AlertTriangle, perm: 'inventory.view' },
      { label: 'nav.items.transfers', href: '/inventory/transfers', icon: ArrowLeftRight, perm: 'inventory.transfer', module: 'warehousing' },
      { label: 'nav.items.loadRequests', href: '/inventory/requests', icon: ClipboardCheck, perm: ['stock_request.create', 'stock_request.approve'], module: 'warehousing' },
      { label: 'nav.items.stockCount', href: '/inventory/count', icon: ClipboardList, perm: 'inventory.count', module: 'warehousing' },
      { label: 'nav.items.expiryNear', href: '/inventory/expiry', icon: CalendarClock, perm: 'inventory.view' },
      { label: 'nav.items.warehouses', href: '/warehouses', icon: Warehouse, perm: 'inventory.view', module: 'warehousing' },
    ],
  },
  {
    title: 'nav.sections.purchasing',
    module: 'purchasing',
    items: [
      { label: 'nav.items.suppliers', href: '/suppliers', icon: Truck, perm: 'suppliers.manage' },
      { label: 'nav.items.purchaseOrders', href: '/purchases/orders', icon: Receipt, perm: 'purchasing.manage' },
      { label: 'nav.items.supplierReturns', href: '/purchases/returns', icon: PackageCheck, perm: 'purchasing.return' },
    ],
  },
  {
    // Electrical Retail & Wholesale pack screens. Gated purely by the
    // `electrical.rma` permission, which migration 0097 seeds only to the
    // electronics business type's roles — so this section appears only for the
    // Electrical pack, never for other verticals. Read-first demo screens.
    title: 'nav.sections.electrical',
    items: [
      { label: 'nav.items.serials', href: '/electrical/serials', icon: Cpu, perm: 'electrical.rma' },
      { label: 'nav.items.warranties', href: '/electrical/warranties', icon: ShieldQuestion, perm: 'electrical.rma' },
      { label: 'nav.items.rma', href: '/electrical/rma', icon: Wrench, perm: 'electrical.rma' },
    ],
  },
  {
    title: 'nav.sections.accounting',
    module: 'accounting',
    items: [
      { label: 'nav.items.chartOfAccounts', href: '/accounting/chart', icon: Tags, perm: 'accounting.view' },
      { label: 'nav.items.vouchers', href: '/accounting/vouchers', icon: ReceiptText, perm: 'accounting.post' },
      { label: 'nav.items.journal', href: '/accounting/journal', icon: Wallet, perm: 'accounting.view' },
      { label: 'nav.items.financialReports', href: '/accounting/reports', icon: BarChart3, perm: 'accounting.view' },
      { label: 'nav.items.aging', href: '/accounting/aging', icon: Clock, perm: ['accounting.view', 'reports.view'] },
      { label: 'nav.items.exports', href: '/exports', icon: Download, perm: ['accounting.view', 'reports.view'] },
    ],
  },
  {
    title: 'nav.sections.settings',
    // UX-1: items grouped into labeled subsections (Organization / Data & Fields /
    // Integrations / Governance / Personal), ordered most-used first within each.
    items: [
      // ── Organization ──
      { label: 'nav.items.branches', href: '/settings/branches', icon: Building2, superAdminOnly: true, group: 'nav.groups.organization' },
      { label: 'nav.items.users', href: '/settings/users', icon: Users, superAdminOnly: true, group: 'nav.groups.organization' },
      { label: 'nav.items.staff', href: '/settings/staff', icon: UserCog, perm: 'settings.users', group: 'nav.groups.organization' },
      { label: 'nav.items.permissions', href: '/settings/permissions', icon: ShieldCheck, superAdminOnly: true, group: 'nav.groups.organization' },
      { label: 'nav.items.organization', href: '/settings/organization', icon: Network, perm: 'settings.users', group: 'nav.groups.organization' },
      { label: 'nav.items.regions', href: '/settings/regions', icon: Map, perm: 'settings.branches', group: 'nav.groups.organization' },
      { label: 'nav.items.marketplace', href: '/settings/marketplace', icon: LayoutGrid, perm: 'settings.users', group: 'nav.groups.organization' },
      // ── Data & Fields ──
      { label: 'nav.items.customerData', href: '/settings/customer-data', icon: Tags, perm: 'settings.custom_fields', group: 'nav.groups.dataFields' },
      { label: 'nav.items.customFields', href: '/settings/custom-fields', icon: SlidersHorizontal, perm: 'settings.custom_fields', group: 'nav.groups.dataFields' },
      { label: 'nav.items.fieldGovernance', href: '/settings/field-governance', icon: SlidersHorizontal, perm: 'settings.custom_fields', group: 'nav.groups.dataFields' },
      // ── Integrations ──
      { label: 'nav.items.integrations', href: '/settings/integrations', icon: Upload, perm: 'integrations.manage', group: 'nav.groups.integrations' },
      { label: 'nav.items.dataImport', href: '/settings/import', icon: FileSpreadsheet, perm: 'integrations.manage', group: 'nav.groups.integrations' },
      { label: 'nav.items.dataExport', href: '/settings/export', icon: FileDown, perm: 'integrations.manage', group: 'nav.groups.integrations' },
      // ── Governance ──
      { label: 'nav.items.workflows', href: '/settings/workflows', icon: GitBranch, perm: 'workflow.manage', module: 'workflow', group: 'nav.groups.governance' },
      { label: 'nav.items.einvoice', href: '/settings/einvoice', icon: ReceiptText, superAdminOnly: true, group: 'nav.groups.governance' },
      { label: 'nav.items.auditLog', href: '/platform/audit', icon: ScrollText, superAdminOnly: true, showForPlatformOwner: true, platformPerm: 'access_audit_logs', group: 'nav.groups.governance' },
      // ── Personal ──
      { label: 'nav.items.designSystem', href: '/design', icon: Palette, superAdminOnly: true, group: 'nav.groups.personal' },
      { label: 'nav.items.myAccount', href: '/account', icon: UserCog, showForPlatformOwner: true, group: 'nav.groups.personal' },
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
  platformPermissions: string[] = [],
  isPlatformStaff = false,
): NavSection[] {
  const has = (perm: Permission | Permission[]) =>
    Array.isArray(perm) ? perm.some((p) => permissions.includes(p)) : permissions.includes(perm);

  // The vendor tier (platform owner OR an internal employee) runs the platform;
  // they belong to no tenant company and must NOT see tenant-operational sections
  // (sales, inventory, hotel, …). They see only the vendor panel: the owner sees
  // owner-flagged items + everything; an employee sees items whose platformPerm
  // they hold.
  if (isPlatformOwner || isPlatformStaff) {
    const hasPlatform = (p?: string) =>
      !!p && (isPlatformOwner || platformPermissions.includes(p));
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (isPlatformOwner && (item.platformOwnerOnly || item.showForPlatformOwner)) return true;
        return hasPlatform(item.platformPerm);
      }),
    })).filter((section) => section.items.length > 0);
  }

  const elevated = isSuperAdmin;
  const unrestricted = modules.length === 0; // platform owner / legacy tenant
  const moduleAllowed = (m?: Module | Module[]) => {
    if (!m || unrestricted) return true;
    // Array = ANY-of: the section/item shows if the company has at least one
    // of the listed modules (so a capability module can be bound alongside a
    // legacy gate without regressing tenants that only have the legacy one).
    return Array.isArray(m) ? m.some((x) => modules.includes(x)) : modules.includes(m);
  };

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
