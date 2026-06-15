// Production-oriented domain model for the VANTORA salesman (van-sales) module.
//
// These interfaces are designed to map onto a real FMCG backend (Supabase /
// ERP) without redesign after pilot. The demo seed in `seed.ts` is only an
// adapter that produces instances of these same types; no demo-only shapes
// leak into the domain.

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export type DayStatus = 'closed' | 'open' | 'ended';

export type VisitStatus = 'pending' | 'in_progress' | 'visited' | 'skipped';

export type VisitOutcome = 'sale' | 'collection' | 'return' | 'no_sale';

export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export type PaymentMethod = 'cash' | 'cheque' | 'transfer';

export type OrderType = 'sale' | 'return';

export type OrderStatus = 'draft' | 'confirmed' | 'invoiced' | 'cancelled';

/** Units of measure an FMCG product can be sold in. */
export type UoMCode = 'PIECE' | 'PACK' | 'BOX' | 'CARTON' | 'CASE';

// ---------------------------------------------------------------------------
// Product + Multi-UoM
// ---------------------------------------------------------------------------

export interface ProductUoM {
  code: UoMCode;
  name: string;
  nameAr: string;
  /** Number of base units (smallest UoM) contained in one of this UoM. */
  factor: number;
  /** Selling price for one unit of THIS UoM. */
  price: number;
  barcode: string | null;
  isBaseUoM: boolean;
  /** Default UoM presented when ordering. */
  isSalesDefault: boolean;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  category: string | null;
  /** VAT / tax rate applied to this product, e.g. 0.15. */
  taxRate: number;
  isActive: boolean;
  /** Smallest stock-keeping unit; inventory is tracked in this UoM. */
  baseUoM: UoMCode;
  uoms: ProductUoM[];
}

// ---------------------------------------------------------------------------
// Van inventory
// ---------------------------------------------------------------------------

export interface VanInventory {
  productId: string;
  /** On-hand quantity expressed in BASE units. */
  qtyBase: number;
  /** Quantity committed to confirmed-but-unsettled orders, in base units. */
  reservedBase: number;
}

// ---------------------------------------------------------------------------
// Customer master + credit + balance (kept separate, ERP-style)
// ---------------------------------------------------------------------------

export interface Customer {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  area: string;
  areaAr: string;
  channel: string | null;
  priceListId: string | null;
  lat: number | null;
  lng: number | null;
  isActive: boolean;
}

export interface CreditLimit {
  customerId: string;
  /** Credit ceiling. 0 (and `cashOnly`) means cash only. */
  creditLimit: number;
  /** Days a customer may be overdue before new sales are blocked. */
  allowedOverdueDays: number;
  /** Explicit cash-only flag (also implied when creditLimit <= 0). */
  cashOnly: boolean;
  currency: string;
}

export interface CustomerBalance {
  customerId: string;
  outstandingBalance: number;
  overdueAmount: number;
  overdueDays: number;
  lastInvoiceDate: string | null;
  lastPaymentDate: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Route + Visit (plan vs execution)
// ---------------------------------------------------------------------------

export interface RouteStop {
  id: string;
  routeId: string;
  customerId: string;
  sequence: number;
  plannedArrival: string | null;
  /** Mirrors the visit lifecycle for fast route rendering. */
  status: VisitStatus;
  outcome: VisitOutcome | null;
}

export interface Visit {
  id: string;
  routeStopId: string;
  customerId: string;
  salesmanId: string;
  status: VisitStatus;
  startedAt: string | null;
  endedAt: string | null;
  outcome: VisitOutcome | null;
  checkInLat: number | null;
  checkInLng: number | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Sales order + lines + invoice
// ---------------------------------------------------------------------------

export interface SalesOrderLine {
  id: string;
  productId: string;
  productName: string;
  productNameAr: string;
  uom: UoMCode;
  /** Quantity in the selected UoM. */
  qty: number;
  /** Quantity converted to base units (for inventory). */
  qtyBase: number;
  /** Price per selected UoM. */
  unitPrice: number;
  discount: number;
  /** qty * unitPrice - discount. */
  lineNet: number;
  taxRate: number;
  taxAmount: number;
  /** lineNet + taxAmount. */
  lineTotal: number;
}

export interface SalesOrder {
  id: string;
  number: string;
  customerId: string;
  salesmanId: string;
  visitId: string | null;
  type: OrderType;
  status: OrderStatus;
  lines: SalesOrderLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  createdAt: string;
}

export interface InvoiceLine {
  productId: string;
  name: string;
  nameAr: string;
  uom: UoMCode;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  number: string;
  orderId: string;
  customerId: string;
  customerName: string;
  type: OrderType;
  lines: InvoiceLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export interface Collection {
  id: string;
  customerId: string;
  invoiceId: string | null;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: string;
  action: string;
  detail: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Convenience view used by UI (flattens master + credit + balance)
// ---------------------------------------------------------------------------

export interface CustomerView {
  customer: Customer;
  credit: CreditLimit;
  balance: CustomerBalance;
}
