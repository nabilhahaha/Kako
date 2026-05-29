// ============================================================================
// Multi-Branch ERP System — Constants
// Labels, defaults, and configuration values used across the ERP UI.
// ============================================================================

import type {
  AccountType,
  BranchRole,
  FiscalPeriodStatus,
  InvoiceStatus,
  JournalStatus,
  PaymentMethod,
  PurchaseOrderStatus,
  ReturnStatus,
  SalesOrderStatus,
  SequenceType,
  StockMovementType,
  TransferStatus,
  VoucherStatus,
} from './types';

// ─── Bilingual Label Type ───────────────────────────────────────────────────

export interface BilingualLabel {
  en: string;
  ar: string;
}

// ─── Branch Role Definitions ────────────────────────────────────────────────

export const BRANCH_ROLES: Record<BranchRole, BilingualLabel> = {
  admin:            { en: 'Administrator',      ar: 'مدير النظام' },
  manager:          { en: 'Branch Manager',     ar: 'مدير الفرع' },
  supervisor:       { en: 'Sales Supervisor',   ar: 'مشرف مبيعات' },
  accountant:       { en: 'Accountant',         ar: 'محاسب' },
  cashier:          { en: 'Cashier',            ar: 'أمين الصندوق' },
  salesman:         { en: 'Salesman',           ar: 'مندوب مبيعات' },
  driver:           { en: 'Driver / Courier',   ar: 'سائق / مندوب توصيل' },
  technician:       { en: 'Technician',         ar: 'فني' },
  doctor:           { en: 'Doctor',             ar: 'طبيب' },
  receptionist:     { en: 'Receptionist',       ar: 'موظف استقبال' },
  stylist:          { en: 'Stylist',            ar: 'أخصائي تجميل' },
  warehouse_keeper: { en: 'Warehouse Keeper',   ar: 'أمين المخزن' },
  staff:            { en: 'Staff',              ar: 'موظف' },
  viewer:           { en: 'Viewer',             ar: 'مشاهد فقط' },
};

export const BRANCH_ROLE_OPTIONS = Object.entries(BRANCH_ROLES).map(
  ([value, label]) => ({ value: value as BranchRole, ...label })
);

// ─── Account Type Labels ────────────────────────────────────────────────────

export const ACCOUNT_TYPE_LABELS: Record<AccountType, BilingualLabel> = {
  asset:     { en: 'Assets',      ar: 'الأصول' },
  liability: { en: 'Liabilities', ar: 'الالتزامات' },
  equity:    { en: 'Equity',      ar: 'حقوق الملكية' },
  revenue:   { en: 'Revenue',     ar: 'الإيرادات' },
  expense:   { en: 'Expenses',    ar: 'المصروفات' },
};

export const ACCOUNT_TYPE_OPTIONS = Object.entries(ACCOUNT_TYPE_LABELS).map(
  ([value, label]) => ({ value: value as AccountType, ...label })
);

// ─── Sales Order Status Labels ──────────────────────────────────────────────

export const SALES_ORDER_STATUS_LABELS: Record<SalesOrderStatus, BilingualLabel> = {
  draft:     { en: 'Draft',     ar: 'مسودة' },
  confirmed: { en: 'Confirmed', ar: 'مؤكد' },
  invoiced:  { en: 'Invoiced',  ar: 'مفوتر' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
};

export const SALES_ORDER_STATUS_OPTIONS = Object.entries(SALES_ORDER_STATUS_LABELS).map(
  ([value, label]) => ({ value: value as SalesOrderStatus, ...label })
);

// ─── Invoice Status Labels ──────────────────────────────────────────────────

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, BilingualLabel> = {
  draft:          { en: 'Draft',          ar: 'مسودة' },
  issued:         { en: 'Issued',         ar: 'صادرة' },
  paid:           { en: 'Paid',           ar: 'مدفوعة' },
  partially_paid: { en: 'Partially Paid', ar: 'مدفوعة جزئياً' },
  cancelled:      { en: 'Cancelled',      ar: 'ملغية' },
  overdue:        { en: 'Overdue',        ar: 'متأخرة' },
};

export const INVOICE_STATUS_OPTIONS = Object.entries(INVOICE_STATUS_LABELS).map(
  ([value, label]) => ({ value: value as InvoiceStatus, ...label })
);

/** Color mapping for invoice status badges */
export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft:          'gray',
  issued:         'blue',
  paid:           'green',
  partially_paid: 'yellow',
  cancelled:      'red',
  overdue:        'orange',
};

// ─── Payment Method Labels ──────────────────────────────────────────────────

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, BilingualLabel> = {
  cash:            { en: 'Cash',            ar: 'نقدي' },
  bank_transfer:   { en: 'Bank Transfer',   ar: 'تحويل بنكي' },
  check:           { en: 'Check',           ar: 'شيك' },
  credit_card:     { en: 'Credit Card',     ar: 'بطاقة ائتمان' },
  mobile_payment:  { en: 'Mobile Payment',  ar: 'دفع إلكتروني' },
};

export const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(
  ([value, label]) => ({ value: value as PaymentMethod, ...label })
);

// ─── Stock Movement Type Labels ─────────────────────────────────────────────

export const STOCK_MOVEMENT_TYPE_LABELS: Record<StockMovementType, BilingualLabel> = {
  purchase_in:     { en: 'Purchase In',     ar: 'وارد مشتريات' },
  sale_out:        { en: 'Sale Out',        ar: 'صادر مبيعات' },
  transfer_out:    { en: 'Transfer Out',    ar: 'صادر تحويل' },
  transfer_in:     { en: 'Transfer In',     ar: 'وارد تحويل' },
  adjustment:      { en: 'Adjustment',      ar: 'تسوية' },
  return_in:       { en: 'Return In',       ar: 'وارد مرتجع' },
  return_out:      { en: 'Return Out',      ar: 'صادر مرتجع' },
  opening_balance: { en: 'Opening Balance', ar: 'رصيد افتتاحي' },
};

export const STOCK_MOVEMENT_TYPE_OPTIONS = Object.entries(STOCK_MOVEMENT_TYPE_LABELS).map(
  ([value, label]) => ({ value: value as StockMovementType, ...label })
);

/** Positive movement types (increase stock) */
export const STOCK_MOVEMENT_INBOUND: StockMovementType[] = [
  'purchase_in',
  'transfer_in',
  'return_in',
  'opening_balance',
];

/** Negative movement types (decrease stock) */
export const STOCK_MOVEMENT_OUTBOUND: StockMovementType[] = [
  'sale_out',
  'transfer_out',
  'return_out',
];

// ─── Transfer Status Labels ────────────────────────────────────────────────

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, BilingualLabel> = {
  draft:      { en: 'Draft',      ar: 'مسودة' },
  in_transit: { en: 'In Transit', ar: 'في الطريق' },
  received:   { en: 'Received',   ar: 'مستلم' },
  cancelled:  { en: 'Cancelled',  ar: 'ملغي' },
};

export const TRANSFER_STATUS_OPTIONS = Object.entries(TRANSFER_STATUS_LABELS).map(
  ([value, label]) => ({ value: value as TransferStatus, ...label })
);

// ─── Purchase Order Status Labels ───────────────────────────────────────────

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, BilingualLabel> = {
  draft:     { en: 'Draft',              ar: 'مسودة' },
  sent:      { en: 'Sent to Supplier',   ar: 'مرسل للمورد' },
  partial:   { en: 'Partially Received', ar: 'مستلم جزئياً' },
  received:  { en: 'Fully Received',     ar: 'مستلم بالكامل' },
  cancelled: { en: 'Cancelled',          ar: 'ملغي' },
};

export const PURCHASE_ORDER_STATUS_OPTIONS = Object.entries(PURCHASE_ORDER_STATUS_LABELS).map(
  ([value, label]) => ({ value: value as PurchaseOrderStatus, ...label })
);

// ─── Return Status Labels ───────────────────────────────────────────────────

export const RETURN_STATUS_LABELS: Record<ReturnStatus, BilingualLabel> = {
  draft:     { en: 'Draft',     ar: 'مسودة' },
  approved:  { en: 'Approved',  ar: 'معتمد' },
  completed: { en: 'Completed', ar: 'مكتمل' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
};

export const RETURN_STATUS_OPTIONS = Object.entries(RETURN_STATUS_LABELS).map(
  ([value, label]) => ({ value: value as ReturnStatus, ...label })
);

// ─── Journal Status Labels ──────────────────────────────────────────────────

export const JOURNAL_STATUS_LABELS: Record<JournalStatus, BilingualLabel> = {
  draft:    { en: 'Draft',    ar: 'مسودة' },
  posted:   { en: 'Posted',   ar: 'مرحل' },
  reversed: { en: 'Reversed', ar: 'معكوس' },
};

export const JOURNAL_STATUS_OPTIONS = Object.entries(JOURNAL_STATUS_LABELS).map(
  ([value, label]) => ({ value: value as JournalStatus, ...label })
);

// ─── Fiscal Period Status Labels ────────────────────────────────────────────

export const FISCAL_PERIOD_STATUS_LABELS: Record<FiscalPeriodStatus, BilingualLabel> = {
  open:   { en: 'Open',   ar: 'مفتوحة' },
  closed: { en: 'Closed', ar: 'مغلقة' },
  locked: { en: 'Locked', ar: 'مقفلة' },
};

export const FISCAL_PERIOD_STATUS_OPTIONS = Object.entries(FISCAL_PERIOD_STATUS_LABELS).map(
  ([value, label]) => ({ value: value as FiscalPeriodStatus, ...label })
);

// ─── Voucher Status Labels ──────────────────────────────────────────────────

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, BilingualLabel> = {
  draft:     { en: 'Draft',     ar: 'مسودة' },
  approved:  { en: 'Approved',  ar: 'معتمد' },
  posted:    { en: 'Posted',    ar: 'مرحل' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
};

export const VOUCHER_STATUS_OPTIONS = Object.entries(VOUCHER_STATUS_LABELS).map(
  ([value, label]) => ({ value: value as VoucherStatus, ...label })
);

// ─── Sequence Type Labels ───────────────────────────────────────────────────

export const SEQUENCE_TYPE_LABELS: Record<SequenceType, BilingualLabel> = {
  invoice:          { en: 'Invoice',          ar: 'فاتورة' },
  sales_order:      { en: 'Sales Order',      ar: 'أمر بيع' },
  purchase_order:   { en: 'Purchase Order',   ar: 'أمر شراء' },
  journal:          { en: 'Journal Entry',    ar: 'قيد يومية' },
  transfer:         { en: 'Transfer Order',   ar: 'أمر تحويل' },
  goods_receipt:    { en: 'Goods Receipt',    ar: 'إذن استلام' },
  return:           { en: 'Sales Return',     ar: 'مرتجع مبيعات' },
  payment_voucher:  { en: 'Payment Voucher',  ar: 'سند صرف' },
  receipt_voucher:  { en: 'Receipt Voucher',  ar: 'سند قبض' },
};

export const SEQUENCE_TYPE_PREFIXES: Record<SequenceType, string> = {
  invoice:          'INV',
  sales_order:      'SO',
  purchase_order:   'PO',
  journal:          'JV',
  transfer:         'TR',
  goods_receipt:    'GR',
  return:           'RET',
  payment_voucher:  'PV',
  receipt_voucher:  'RV',
};

// ─── Visit Days (journey plan) ──────────────────────────────────────────────

export const VISIT_DAYS: { value: string; ar: string }[] = [
  { value: 'sat', ar: 'السبت' },
  { value: 'sun', ar: 'الأحد' },
  { value: 'mon', ar: 'الإثنين' },
  { value: 'tue', ar: 'الثلاثاء' },
  { value: 'wed', ar: 'الأربعاء' },
  { value: 'thu', ar: 'الخميس' },
  { value: 'fri', ar: 'الجمعة' },
];

export const VISIT_DAY_LABEL: Record<string, string> = Object.fromEntries(
  VISIT_DAYS.map((d) => [d.value, d.ar]),
);

// ─── Product Unit Labels ────────────────────────────────────────────────────

export const PRODUCT_UNIT_LABELS: Record<string, BilingualLabel> = {
  piece:  { en: 'Piece',  ar: 'قطعة' },
  kg:     { en: 'KG',     ar: 'كيلوجرام' },
  gram:   { en: 'Gram',   ar: 'جرام' },
  liter:  { en: 'Liter',  ar: 'لتر' },
  ml:     { en: 'ML',     ar: 'مللي لتر' },
  box:    { en: 'Box',    ar: 'صندوق' },
  carton: { en: 'Carton', ar: 'كرتون' },
  pack:   { en: 'Pack',   ar: 'عبوة' },
  meter:  { en: 'Meter',  ar: 'متر' },
};

export const PRODUCT_UNIT_OPTIONS = Object.entries(PRODUCT_UNIT_LABELS).map(
  ([value, label]) => ({ value, ...label })
);

// ─── Default Chart of Accounts Structure ────────────────────────────────────

export interface DefaultAccountEntry {
  code: string;
  name: string;
  name_ar: string;
  account_type: AccountType;
  is_group: boolean;
  parent_code: string | null;
}

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccountEntry[] = [
  // Assets (1xxx)
  { code: '1000', name: 'Assets',                        name_ar: 'الأصول',                    account_type: 'asset',     is_group: true,  parent_code: null },
  { code: '1100', name: 'Cash and Cash Equivalents',     name_ar: 'النقدية وما في حكمها',      account_type: 'asset',     is_group: false, parent_code: '1000' },
  { code: '1110', name: 'Cash on Hand',                  name_ar: 'النقدية بالصندوق',          account_type: 'asset',     is_group: false, parent_code: '1100' },
  { code: '1120', name: 'Cash at Bank',                  name_ar: 'النقدية بالبنك',            account_type: 'asset',     is_group: false, parent_code: '1100' },
  { code: '1200', name: 'Accounts Receivable',           name_ar: 'العملاء (المدينون)',         account_type: 'asset',     is_group: false, parent_code: '1000' },
  { code: '1210', name: 'Notes Receivable',              name_ar: 'أوراق القبض',              account_type: 'asset',     is_group: false, parent_code: '1200' },
  { code: '1220', name: 'Employee Receivables',          name_ar: 'سلف وعهد الموظفين',        account_type: 'asset',     is_group: false, parent_code: '1200' },
  { code: '1300', name: 'Inventory',                     name_ar: 'المخزون',                   account_type: 'asset',     is_group: false, parent_code: '1000' },
  { code: '1310', name: 'Raw Materials',                 name_ar: 'مواد خام',                  account_type: 'asset',     is_group: false, parent_code: '1300' },
  { code: '1320', name: 'Finished Goods',                name_ar: 'بضاعة تامة الصنع',         account_type: 'asset',     is_group: false, parent_code: '1300' },
  { code: '1330', name: 'Goods in Transit',              name_ar: 'بضاعة بالطريق',            account_type: 'asset',     is_group: false, parent_code: '1300' },
  { code: '1400', name: 'Prepaid Expenses',              name_ar: 'مصروفات مدفوعة مقدماً',    account_type: 'asset',     is_group: false, parent_code: '1000' },
  { code: '1500', name: 'Fixed Assets',                  name_ar: 'الأصول الثابتة',            account_type: 'asset',     is_group: true,  parent_code: '1000' },
  { code: '1510', name: 'Land',                          name_ar: 'أراضي',                    account_type: 'asset',     is_group: false, parent_code: '1500' },
  { code: '1520', name: 'Buildings',                     name_ar: 'مباني',                    account_type: 'asset',     is_group: false, parent_code: '1500' },
  { code: '1530', name: 'Vehicles',                      name_ar: 'سيارات',                   account_type: 'asset',     is_group: false, parent_code: '1500' },
  { code: '1540', name: 'Furniture & Equipment',         name_ar: 'أثاث ومعدات',              account_type: 'asset',     is_group: false, parent_code: '1500' },
  { code: '1550', name: 'Computers & IT Equipment',      name_ar: 'أجهزة حاسب وتقنية',        account_type: 'asset',     is_group: false, parent_code: '1500' },
  { code: '1590', name: 'Accumulated Depreciation',      name_ar: 'مجمع الإهلاك',             account_type: 'asset',     is_group: false, parent_code: '1500' },

  // Liabilities (2xxx)
  { code: '2000', name: 'Liabilities',                   name_ar: 'الالتزامات',               account_type: 'liability', is_group: true,  parent_code: null },
  { code: '2100', name: 'Accounts Payable',              name_ar: 'الموردون (الدائنون)',       account_type: 'liability', is_group: false, parent_code: '2000' },
  { code: '2110', name: 'Notes Payable',                 name_ar: 'أوراق الدفع',              account_type: 'liability', is_group: false, parent_code: '2000' },
  { code: '2200', name: 'Accrued Expenses',              name_ar: 'مصروفات مستحقة',           account_type: 'liability', is_group: false, parent_code: '2000' },
  { code: '2300', name: 'VAT Payable',                   name_ar: 'ضريبة القيمة المضافة',      account_type: 'liability', is_group: false, parent_code: '2000' },
  { code: '2310', name: 'Withholding Tax Payable',       name_ar: 'ضريبة خصم واضافة',         account_type: 'liability', is_group: false, parent_code: '2000' },
  { code: '2400', name: 'Social Insurance Payable',      name_ar: 'تأمينات اجتماعية مستحقة',   account_type: 'liability', is_group: false, parent_code: '2000' },
  { code: '2500', name: 'Short-term Loans',              name_ar: 'قروض قصيرة الأجل',         account_type: 'liability', is_group: false, parent_code: '2000' },
  { code: '2600', name: 'Long-term Loans',               name_ar: 'قروض طويلة الأجل',         account_type: 'liability', is_group: false, parent_code: '2000' },
  { code: '2700', name: 'Employee Benefits Payable',     name_ar: 'مستحقات الموظفين',          account_type: 'liability', is_group: false, parent_code: '2000' },
  { code: '2800', name: 'Unearned Revenue',              name_ar: 'إيرادات مقدمة',            account_type: 'liability', is_group: false, parent_code: '2000' },

  // Equity (3xxx)
  { code: '3000', name: 'Equity',                        name_ar: 'حقوق الملكية',             account_type: 'equity',    is_group: true,  parent_code: null },
  { code: '3100', name: 'Capital',                       name_ar: 'رأس المال',                account_type: 'equity',    is_group: false, parent_code: '3000' },
  { code: '3200', name: 'Retained Earnings',             name_ar: 'أرباح مرحلة',              account_type: 'equity',    is_group: false, parent_code: '3000' },
  { code: '3300', name: 'Reserves',                      name_ar: 'احتياطيات',                account_type: 'equity',    is_group: false, parent_code: '3000' },
  { code: '3310', name: 'Legal Reserve',                 name_ar: 'احتياطي قانوني',           account_type: 'equity',    is_group: false, parent_code: '3300' },
  { code: '3320', name: 'General Reserve',               name_ar: 'احتياطي عام',              account_type: 'equity',    is_group: false, parent_code: '3300' },
  { code: '3400', name: 'Current Year Profit/Loss',      name_ar: 'أرباح / خسائر العام',       account_type: 'equity',    is_group: false, parent_code: '3000' },

  // Revenue (4xxx)
  { code: '4000', name: 'Revenue',                       name_ar: 'الإيرادات',                account_type: 'revenue',   is_group: true,  parent_code: null },
  { code: '4100', name: 'Sales Revenue',                 name_ar: 'إيرادات المبيعات',          account_type: 'revenue',   is_group: false, parent_code: '4000' },
  { code: '4110', name: 'Sales Returns',                 name_ar: 'مردودات المبيعات',          account_type: 'revenue',   is_group: false, parent_code: '4100' },
  { code: '4120', name: 'Sales Discounts',               name_ar: 'خصم مسموح به',             account_type: 'revenue',   is_group: false, parent_code: '4100' },
  { code: '4200', name: 'Service Revenue',               name_ar: 'إيرادات خدمات',            account_type: 'revenue',   is_group: false, parent_code: '4000' },
  { code: '4300', name: 'Other Revenue',                 name_ar: 'إيرادات أخرى',             account_type: 'revenue',   is_group: false, parent_code: '4000' },
  { code: '4310', name: 'Interest Income',               name_ar: 'إيرادات فوائد',            account_type: 'revenue',   is_group: false, parent_code: '4300' },
  { code: '4320', name: 'Foreign Exchange Gains',        name_ar: 'أرباح فروق عملة',          account_type: 'revenue',   is_group: false, parent_code: '4300' },

  // Expenses (5xxx)
  { code: '5000', name: 'Expenses',                      name_ar: 'المصروفات',                account_type: 'expense',   is_group: true,  parent_code: null },
  { code: '5100', name: 'Cost of Goods Sold',            name_ar: 'تكلفة البضاعة المباعة',     account_type: 'expense',   is_group: false, parent_code: '5000' },
  { code: '5200', name: 'Salaries & Wages',              name_ar: 'مرتبات وأجور',             account_type: 'expense',   is_group: false, parent_code: '5000' },
  { code: '5210', name: 'Social Insurance Expense',      name_ar: 'تأمينات اجتماعية',          account_type: 'expense',   is_group: false, parent_code: '5200' },
  { code: '5220', name: 'Employee Benefits',             name_ar: 'مزايا الموظفين',            account_type: 'expense',   is_group: false, parent_code: '5200' },
  { code: '5300', name: 'Rent Expense',                  name_ar: 'إيجارات',                  account_type: 'expense',   is_group: false, parent_code: '5000' },
  { code: '5310', name: 'Utilities',                     name_ar: 'كهرباء ومياه وغاز',        account_type: 'expense',   is_group: false, parent_code: '5300' },
  { code: '5320', name: 'Telecommunications',            name_ar: 'اتصالات',                  account_type: 'expense',   is_group: false, parent_code: '5300' },
  { code: '5400', name: 'Office Supplies',               name_ar: 'مستلزمات مكتبية',          account_type: 'expense',   is_group: false, parent_code: '5000' },
  { code: '5410', name: 'Printing & Stationery',         name_ar: 'طباعة وأدوات كتابية',       account_type: 'expense',   is_group: false, parent_code: '5400' },
  { code: '5500', name: 'Transportation',                name_ar: 'انتقالات ومواصلات',         account_type: 'expense',   is_group: false, parent_code: '5000' },
  { code: '5510', name: 'Vehicle Expenses',              name_ar: 'مصروفات سيارات',           account_type: 'expense',   is_group: false, parent_code: '5500' },
  { code: '5600', name: 'Depreciation Expense',          name_ar: 'إهلاكات',                  account_type: 'expense',   is_group: false, parent_code: '5000' },
  { code: '5700', name: 'Marketing & Advertising',       name_ar: 'تسويق وإعلان',             account_type: 'expense',   is_group: false, parent_code: '5000' },
  { code: '5800', name: 'Professional Fees',             name_ar: 'أتعاب مهنية',              account_type: 'expense',   is_group: false, parent_code: '5000' },
  { code: '5810', name: 'Legal Fees',                    name_ar: 'أتعاب قانونية',            account_type: 'expense',   is_group: false, parent_code: '5800' },
  { code: '5820', name: 'Audit Fees',                    name_ar: 'أتعاب مراجعة',             account_type: 'expense',   is_group: false, parent_code: '5800' },
  { code: '5900', name: 'Bank Charges',                  name_ar: 'مصروفات بنكية',            account_type: 'expense',   is_group: false, parent_code: '5000' },
  { code: '5910', name: 'Interest Expense',              name_ar: 'مصروفات فوائد',            account_type: 'expense',   is_group: false, parent_code: '5900' },
  { code: '5920', name: 'Foreign Exchange Losses',       name_ar: 'خسائر فروق عملة',          account_type: 'expense',   is_group: false, parent_code: '5900' },
  { code: '5990', name: 'Other Expenses',                name_ar: 'مصروفات أخرى',             account_type: 'expense',   is_group: false, parent_code: '5000' },
];

// ─── System Account Codes (used in triggers) ───────────────────────────────

export const SYSTEM_ACCOUNT_CODES = {
  CASH:                 '1100',
  CASH_ON_HAND:         '1110',
  CASH_AT_BANK:         '1120',
  ACCOUNTS_RECEIVABLE:  '1200',
  INVENTORY:            '1300',
  ACCOUNTS_PAYABLE:     '2100',
  VAT_PAYABLE:          '2300',
  SALES_REVENUE:        '4100',
  SALES_RETURNS:        '4110',
  SALES_DISCOUNTS:      '4120',
  COGS:                 '5100',
} as const;

// ─── Reference Types (for journal entries & stock movements) ────────────────

export const REFERENCE_TYPES = {
  INVOICE:        'invoice',
  PAYMENT:        'payment',
  PURCHASE_ORDER: 'purchase_order',
  GOODS_RECEIPT:  'goods_receipt',
  SALES_RETURN:   'sales_return',
  TRANSFER:       'transfer',
  MANUAL:         'manual',
  VOUCHER:        'voucher',
} as const;

export type ReferenceType = (typeof REFERENCE_TYPES)[keyof typeof REFERENCE_TYPES];

export const REFERENCE_TYPE_LABELS: Record<ReferenceType, BilingualLabel> = {
  invoice:        { en: 'Invoice',         ar: 'فاتورة' },
  payment:        { en: 'Payment',         ar: 'دفعة' },
  purchase_order: { en: 'Purchase Order',  ar: 'أمر شراء' },
  goods_receipt:  { en: 'Goods Receipt',   ar: 'إذن استلام' },
  sales_return:   { en: 'Sales Return',    ar: 'مرتجع مبيعات' },
  transfer:       { en: 'Transfer',        ar: 'تحويل' },
  manual:         { en: 'Manual',          ar: 'يدوي' },
  voucher:        { en: 'Voucher',         ar: 'سند' },
};

// ─── Default Currency ───────────────────────────────────────────────────────

export const DEFAULT_CURRENCY = 'EGP';

export const CURRENCY_LABELS: Record<string, BilingualLabel> = {
  EGP: { en: 'Egyptian Pound',  ar: 'جنيه مصري' },
  USD: { en: 'US Dollar',       ar: 'دولار أمريكي' },
  EUR: { en: 'Euro',            ar: 'يورو' },
  SAR: { en: 'Saudi Riyal',     ar: 'ريال سعودي' },
  AED: { en: 'UAE Dirham',      ar: 'درهم إماراتي' },
};

// ─── Tax Rates (Egypt) ──────────────────────────────────────────────────────

export const TAX_RATES = {
  VAT_STANDARD: 14,        // 14% standard VAT in Egypt
  VAT_ZERO: 0,             // Zero-rated
  WITHHOLDING_TAX: 1,      // 1% withholding on commercial transactions
} as const;

// ─── Pagination Defaults ────────────────────────────────────────────────────

export const ERP_PAGE_SIZE = 25;
export const ERP_MAX_PAGE_SIZE = 100;

// ─── Table Name Constants ───────────────────────────────────────────────────

export const ERP_TABLES = {
  COMPANIES:              'erp_companies',
  BRANCHES:               'erp_branches',
  USER_BRANCHES:          'erp_user_branches',
  WAREHOUSES:             'erp_warehouses',
  PRODUCT_CATEGORIES:     'erp_product_categories',
  PRODUCTS_CATALOG:       'erp_products_catalog',
  INVENTORY_STOCK:        'erp_inventory_stock',
  STOCK_MOVEMENTS:        'erp_stock_movements',
  TRANSFER_ORDERS:        'erp_transfer_orders',
  TRANSFER_ORDER_LINES:   'erp_transfer_order_lines',
  PRICE_LISTS:            'erp_price_lists',
  PRICE_LIST_ITEMS:       'erp_price_list_items',
  CUSTOMERS:              'erp_customers',
  SALES_ORDERS:           'erp_sales_orders',
  SALES_ORDER_LINES:      'erp_sales_order_lines',
  INVOICES:               'erp_invoices',
  INVOICE_LINES:          'erp_invoice_lines',
  PAYMENTS:               'erp_payments',
  SALES_RETURNS:          'erp_sales_returns',
  SALES_RETURN_LINES:     'erp_sales_return_lines',
  SUPPLIERS:              'erp_suppliers',
  PURCHASE_ORDERS:        'erp_purchase_orders',
  PURCHASE_ORDER_LINES:   'erp_purchase_order_lines',
  GOODS_RECEIPTS:         'erp_goods_receipts',
  GOODS_RECEIPT_LINES:    'erp_goods_receipt_lines',
  SUPPLIER_PAYMENTS:      'erp_supplier_payments',
  CHART_OF_ACCOUNTS:      'erp_chart_of_accounts',
  FISCAL_PERIODS:         'erp_fiscal_periods',
  COST_CENTERS:           'erp_cost_centers',
  JOURNAL_ENTRIES:        'erp_journal_entries',
  JOURNAL_LINES:          'erp_journal_lines',
  PAYMENT_VOUCHERS:       'erp_payment_vouchers',
  RECEIPT_VOUCHERS:       'erp_receipt_vouchers',
  BANK_ACCOUNTS:          'erp_bank_accounts',
  SEQUENCES:              'erp_sequences',
} as const;
