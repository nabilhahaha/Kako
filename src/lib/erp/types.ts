// ============================================================================
// Multi-Branch ERP System — TypeScript Types
// Matches database schema from migration 0005_multi_branch_erp.sql
// ============================================================================

// ─── Enum Types ─────────────────────────────────────────────────────────────

export type StockMovementType =
  | 'purchase_in'
  | 'sale_out'
  | 'transfer_out'
  | 'transfer_in'
  | 'adjustment'
  | 'return_in'
  | 'return_out'
  | 'opening_balance';

export type TransferStatus = 'draft' | 'in_transit' | 'received' | 'cancelled';

export type SalesOrderStatus = 'draft' | 'confirmed' | 'invoiced' | 'cancelled';

export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'paid'
  | 'partially_paid'
  | 'cancelled'
  | 'overdue';

export type PaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'check'
  | 'credit_card'
  | 'mobile_payment';

export type ReturnStatus = 'draft' | 'approved' | 'completed' | 'cancelled';

export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'partial'
  | 'received'
  | 'cancelled';

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'expense';

export type FiscalPeriodStatus = 'open' | 'closed' | 'locked';

export type JournalStatus = 'draft' | 'posted' | 'reversed';

export type VoucherStatus = 'draft' | 'approved' | 'posted' | 'cancelled';

export type SequenceType =
  | 'invoice'
  | 'sales_order'
  | 'purchase_order'
  | 'journal'
  | 'transfer'
  | 'goods_receipt'
  | 'return'
  | 'payment_voucher'
  | 'receipt_voucher';

/** Branch-level role for user_branches */
export type BranchRole =
  | 'admin'
  | 'manager'
  | 'supervisor'
  | 'accountant'
  | 'cashier'
  | 'salesman'
  | 'warehouse_keeper'
  | 'staff'
  | 'viewer';

/** Product unit of measure */
export type ProductUnit =
  | 'piece'
  | 'kg'
  | 'gram'
  | 'liter'
  | 'ml'
  | 'box'
  | 'carton'
  | 'pack'
  | 'meter'
  | string;

// ─── Company & Branch Structure ─────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  name_ar: string | null;
  tax_number: string | null;
  cr_number: string | null;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  company_id: string;
  code: string;
  name: string;
  name_ar: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  is_hq: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserBranch {
  id: string;
  user_id: string;
  branch_id: string;
  role: BranchRole;
  is_default: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_super_admin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A profile joined with its branch assignments (UI convenience). */
export interface ProfileWithBranches extends Profile {
  branches: (UserBranch & { branch: Branch })[];
}

// ─── Inventory / Warehouse ──────────────────────────────────────────────────

export interface Warehouse {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  name_ar: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductCategory {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  name_ar: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductCatalog {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  barcode: string | null;
  category_id: string | null;
  unit: ProductUnit;
  cost_price: number;
  sell_price: number;
  min_stock: number;
  tax_rate: number;
  is_active: boolean;
  image_url: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryStock {
  id: string;
  warehouse_id: string;
  product_id: string;
  quantity: number;
  reserved_qty: number;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  movement_type: StockMovementType;
  warehouse_id: string;
  product_id: string;
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TransferOrder {
  id: string;
  transfer_number: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: TransferStatus;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransferOrderLine {
  id: string;
  transfer_order_id: string;
  product_id: string;
  quantity: number;
  received_qty: number;
  created_at: string;
}

// ─── Sales ──────────────────────────────────────────────────────────────────

export interface PriceList {
  id: string;
  name: string;
  name_ar: string | null;
  branch_id: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PriceListItem {
  id: string;
  price_list_id: string;
  product_id: string;
  unit_price: number;
  created_at: string;
  updated_at: string;
}

export interface ErpCustomer {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  tax_number: string | null;
  credit_limit: number;
  balance: number;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalesOrder {
  id: string;
  branch_id: string;
  customer_id: string;
  order_number: string;
  status: SalesOrderStatus;
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  net_amount: number;
  notes: string | null;
  salesman_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesOrderLine {
  id: string;
  sales_order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  branch_id: string;
  customer_id: string;
  invoice_number: string;
  sales_order_id: string | null;
  status: InvoiceStatus;
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  net_amount: number;
  due_date: string | null;
  paid_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  created_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number: string | null;
  payment_date: string;
  notes: string | null;
  received_by: string | null;
  created_at: string;
}

export interface SalesReturn {
  id: string;
  branch_id: string;
  customer_id: string;
  invoice_id: string | null;
  return_number: string;
  status: ReturnStatus;
  total_amount: number;
  reason: string | null;
  notes: string | null;
  approved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesReturnLine {
  id: string;
  return_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
}

// ─── Procurement / Purchases ────────────────────────────────────────────────

export interface Supplier {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  tax_number: string | null;
  balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  branch_id: string;
  supplier_id: string;
  po_number: string;
  status: PurchaseOrderStatus;
  total_amount: number;
  tax_amount: number;
  net_amount: number;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  received_qty: number;
  line_total: number;
  created_at: string;
}

export interface GoodsReceipt {
  id: string;
  purchase_order_id: string;
  warehouse_id: string;
  receipt_number: string;
  notes: string | null;
  received_by: string | null;
  created_at: string;
}

export interface GoodsReceiptLine {
  id: string;
  goods_receipt_id: string;
  product_id: string;
  quantity_received: number;
  batch_number: string | null;
  expiry_date: string | null;
  created_at: string;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number: string | null;
  payment_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// ─── Accounting ─────────────────────────────────────────────────────────────

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  account_type: AccountType;
  parent_id: string | null;
  is_group: boolean;
  is_system: boolean;
  branch_id: string | null;
  balance: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FiscalPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: FiscalPeriodStatus;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  branch_id: string | null;
  fiscal_period_id: string | null;
  status: JournalStatus;
  created_by: string | null;
  posted_by: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalLine {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  cost_center_id: string | null;
  description: string | null;
  created_at: string;
}

export interface PaymentVoucher {
  id: string;
  voucher_number: string;
  voucher_date: string;
  payee: string;
  amount: number;
  account_id: string;
  branch_id: string;
  notes: string | null;
  status: VoucherStatus;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptVoucher {
  id: string;
  voucher_number: string;
  voucher_date: string;
  payer: string;
  amount: number;
  account_id: string;
  branch_id: string;
  notes: string | null;
  status: VoucherStatus;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  id: string;
  name: string;
  bank_name: string;
  account_number: string;
  iban: string | null;
  swift_code: string | null;
  branch_id: string;
  account_id: string | null;
  balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Sequences ──────────────────────────────────────────────────────────────

export interface Sequence {
  id: string;
  branch_id: string;
  seq_type: SequenceType;
  prefix: string;
  current_val: number;
  created_at: string;
}

// ─── Joined / View Types (commonly used in UI) ─────────────────────────────

/** Inventory stock with product and warehouse details */
export interface InventoryStockWithDetails extends InventoryStock {
  product: ProductCatalog;
  warehouse: Warehouse;
}

/** Sales order with lines and customer info */
export interface SalesOrderWithDetails extends SalesOrder {
  customer: ErpCustomer;
  branch: Branch;
  lines: SalesOrderLineWithProduct[];
}

export interface SalesOrderLineWithProduct extends SalesOrderLine {
  product: ProductCatalog;
}

/** Invoice with lines and payment info */
export interface InvoiceWithDetails extends Invoice {
  customer: ErpCustomer;
  branch: Branch;
  lines: InvoiceLineWithProduct[];
  payments: Payment[];
}

export interface InvoiceLineWithProduct extends InvoiceLine {
  product: ProductCatalog;
}

/** Purchase order with lines and supplier info */
export interface PurchaseOrderWithDetails extends PurchaseOrder {
  supplier: Supplier;
  branch: Branch;
  lines: PurchaseOrderLineWithProduct[];
}

export interface PurchaseOrderLineWithProduct extends PurchaseOrderLine {
  product: ProductCatalog;
}

/** Journal entry with all lines */
export interface JournalEntryWithLines extends JournalEntry {
  lines: JournalLineWithAccount[];
  total_debit: number;
  total_credit: number;
}

export interface JournalLineWithAccount extends JournalLine {
  account: ChartOfAccount;
  cost_center?: CostCenter;
}

/** Transfer order with lines */
export interface TransferOrderWithDetails extends TransferOrder {
  from_warehouse: Warehouse;
  to_warehouse: Warehouse;
  lines: TransferOrderLineWithProduct[];
}

export interface TransferOrderLineWithProduct extends TransferOrderLine {
  product: ProductCatalog;
}

/** Goods receipt with lines */
export interface GoodsReceiptWithDetails extends GoodsReceipt {
  purchase_order: PurchaseOrder;
  warehouse: Warehouse;
  lines: GoodsReceiptLineWithProduct[];
}

export interface GoodsReceiptLineWithProduct extends GoodsReceiptLine {
  product: ProductCatalog;
}

/** Sales return with lines */
export interface SalesReturnWithDetails extends SalesReturn {
  customer: ErpCustomer;
  branch: Branch;
  invoice?: Invoice;
  lines: SalesReturnLineWithProduct[];
}

export interface SalesReturnLineWithProduct extends SalesReturnLine {
  product: ProductCatalog;
}

/** Chart of accounts tree node */
export interface ChartOfAccountNode extends ChartOfAccount {
  children: ChartOfAccountNode[];
  level: number;
}

/** User with branch assignments */
export interface UserWithBranches {
  user_id: string;
  branches: (UserBranch & { branch: Branch })[];
  default_branch_id: string | null;
}

// ─── Form / Input Types ─────────────────────────────────────────────────────

export interface CreateSalesOrderInput {
  branch_id: string;
  customer_id: string;
  notes?: string;
  salesman_id?: string;
  lines: {
    product_id: string;
    quantity: number;
    unit_price: number;
    discount_pct?: number;
  }[];
}

export interface CreateInvoiceInput {
  branch_id: string;
  customer_id: string;
  sales_order_id?: string;
  due_date?: string;
  notes?: string;
  lines: {
    product_id: string;
    quantity: number;
    unit_price: number;
    discount_pct?: number;
  }[];
}

export interface CreatePaymentInput {
  invoice_id: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number?: string;
  payment_date?: string;
  notes?: string;
}

export interface CreatePurchaseOrderInput {
  branch_id: string;
  supplier_id: string;
  notes?: string;
  lines: {
    product_id: string;
    quantity: number;
    unit_price: number;
  }[];
}

export interface CreateGoodsReceiptInput {
  purchase_order_id: string;
  warehouse_id: string;
  notes?: string;
  lines: {
    product_id: string;
    quantity_received: number;
    batch_number?: string;
    expiry_date?: string;
  }[];
}

export interface CreateTransferOrderInput {
  from_warehouse_id: string;
  to_warehouse_id: string;
  notes?: string;
  lines: {
    product_id: string;
    quantity: number;
  }[];
}

export interface CreateJournalEntryInput {
  entry_date?: string;
  description?: string;
  reference_type?: string;
  reference_id?: string;
  branch_id?: string;
  lines: {
    account_id: string;
    debit: number;
    credit: number;
    cost_center_id?: string;
    description?: string;
  }[];
}

export interface StockAdjustmentInput {
  warehouse_id: string;
  product_id: string;
  quantity: number; // signed: positive to add, negative to subtract
  notes?: string;
}

export interface CreateSalesReturnInput {
  branch_id: string;
  customer_id: string;
  invoice_id?: string;
  reason?: string;
  notes?: string;
  lines: {
    product_id: string;
    quantity: number;
    unit_price: number;
  }[];
}

// ─── Filter / Query Types ───────────────────────────────────────────────────

export interface DateRange {
  from: string;
  to: string;
}

export interface InventoryFilter {
  warehouse_id?: string;
  product_id?: string;
  category_id?: string;
  below_min_stock?: boolean;
  search?: string;
}

export interface SalesFilter {
  branch_id?: string;
  customer_id?: string;
  status?: SalesOrderStatus | InvoiceStatus;
  date_range?: DateRange;
  salesman_id?: string;
  search?: string;
}

export interface PurchaseFilter {
  branch_id?: string;
  supplier_id?: string;
  status?: PurchaseOrderStatus;
  date_range?: DateRange;
  search?: string;
}

export interface JournalFilter {
  branch_id?: string;
  status?: JournalStatus;
  reference_type?: string;
  date_range?: DateRange;
  account_id?: string;
  search?: string;
}

export interface StockMovementFilter {
  warehouse_id?: string;
  product_id?: string;
  movement_type?: StockMovementType;
  date_range?: DateRange;
  reference_type?: string;
}

// ─── Dashboard / Summary Types ──────────────────────────────────────────────

export interface BranchDashboard {
  branch_id: string;
  branch_name: string;
  total_sales_today: number;
  total_sales_month: number;
  total_receivables: number;
  total_payables: number;
  pending_orders: number;
  pending_invoices: number;
  low_stock_items: number;
  pending_transfers: number;
}

export interface InventorySummary {
  total_products: number;
  total_stock_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
  warehouses: {
    warehouse_id: string;
    warehouse_name: string;
    total_items: number;
    total_value: number;
  }[];
}

export interface SalesSummary {
  total_orders: number;
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
  overdue_amount: number;
  by_salesman: {
    salesman_id: string;
    salesman_name: string;
    total_sales: number;
    total_collected: number;
  }[];
}

export interface AccountBalanceSummary {
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  total_revenue: number;
  total_expenses: number;
  net_income: number;
}
