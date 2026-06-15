import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type {
  AuditEntry,
  Collection,
  CreditLimit,
  Customer,
  CustomerBalance,
  CustomerView,
  DayStatus,
  Invoice,
  PaymentMethod,
  Product,
  RouteStop,
  SalesOrder,
  SalesOrderLine,
  VanInventory,
  Visit,
  VisitOutcome,
  UoMCode,
} from '@/lib/salesman/types';
import { toBaseQty, getUoM } from '@/lib/salesman/uom';
import {
  SEED_BALANCES,
  SEED_CREDIT_LIMITS,
  SEED_CUSTOMERS,
  SEED_PRODUCTS,
  SEED_ROUTE,
  SEED_SALESMAN,
  SEED_VAN_INVENTORY,
} from '@/lib/salesman/seed';

const round2 = (n: number) => Math.round(n * 100) / 100;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const pad = (n: number) => String(n).padStart(5, '0');

export interface SaleLineInput {
  productId: string;
  uom: UoMCode;
  qty: number;
}

interface SalesmanDayState {
  status: DayStatus;
  salesmanId: string;
  salesmanName: string;
  salesmanNameAr: string;
  routeId: string;
  routeName: string;
  routeNameAr: string;
  openedAt: string | null;
  endedAt: string | null;
  online: boolean;
  orderSeq: number;

  customers: Record<string, Customer>;
  creditLimits: Record<string, CreditLimit>;
  balances: Record<string, CustomerBalance>;
  products: Record<string, Product>;
  vanInventory: Record<string, VanInventory>;
  route: RouteStop[];
  visits: Record<string, Visit>;
  orders: SalesOrder[];
  invoices: Invoice[];
  collections: Collection[];
  audit: AuditEntry[];

  // actions
  openDay: () => void;
  endDay: () => void;
  toggleOnline: () => void;
  startVisit: (customerId: string) => void;
  recordNoSale: (customerId: string) => void;
  createSale: (
    customerId: string,
    lines: SaleLineInput[],
    paidNow: number,
    method: PaymentMethod,
  ) => Invoice;
  createReturn: (customerId: string, lines: SaleLineInput[]) => Invoice;
  recordCollection: (
    customerId: string,
    amount: number,
    method: PaymentMethod,
    reference: string | null,
    invoiceId?: string | null,
  ) => Collection;
  resetDay: () => void;
}

function buildOrderLines(
  products: Record<string, Product>,
  input: SaleLineInput[],
): SalesOrderLine[] {
  return input
    .filter((l) => l.qty > 0)
    .map((l) => {
      const product = products[l.productId];
      const u = getUoM(product, l.uom);
      const unitPrice = u?.price ?? 0;
      const lineNet = round2(unitPrice * l.qty);
      const taxAmount = round2(lineNet * product.taxRate);
      return {
        id: uid('sol'),
        productId: product.id,
        productName: product.name,
        productNameAr: product.nameAr,
        uom: l.uom,
        qty: l.qty,
        qtyBase: toBaseQty(product, l.uom, l.qty),
        unitPrice,
        discount: 0,
        lineNet,
        taxRate: product.taxRate,
        taxAmount,
        lineTotal: round2(lineNet + taxAmount),
      };
    });
}

function summarize(lines: SalesOrderLine[]) {
  const subtotal = round2(lines.reduce((a, l) => a + l.lineNet, 0));
  const taxTotal = round2(lines.reduce((a, l) => a + l.taxAmount, 0));
  const total = round2(subtotal + taxTotal);
  return { subtotal, taxTotal, total };
}

const initialState = {
  status: 'closed' as DayStatus,
  salesmanId: SEED_SALESMAN.id,
  salesmanName: SEED_SALESMAN.name,
  salesmanNameAr: SEED_SALESMAN.nameAr,
  routeId: SEED_SALESMAN.routeId,
  routeName: SEED_SALESMAN.routeName,
  routeNameAr: SEED_SALESMAN.routeNameAr,
  openedAt: null,
  endedAt: null,
  online: true,
  orderSeq: 1,
  customers: Object.fromEntries(SEED_CUSTOMERS.map((c) => [c.id, c])),
  creditLimits: Object.fromEntries(SEED_CREDIT_LIMITS.map((c) => [c.customerId, c])),
  balances: Object.fromEntries(SEED_BALANCES.map((b) => [b.customerId, b])),
  products: Object.fromEntries(SEED_PRODUCTS.map((p) => [p.id, p])),
  vanInventory: Object.fromEntries(SEED_VAN_INVENTORY.map((v) => [v.productId, v])),
  route: SEED_ROUTE,
  visits: {} as Record<string, Visit>,
  orders: [] as SalesOrder[],
  invoices: [] as Invoice[],
  collections: [] as Collection[],
  audit: [] as AuditEntry[],
};

function audit(s: { audit: AuditEntry[] }, action: string, detail: string) {
  return [
    { id: uid('a'), action, detail, createdAt: new Date().toISOString() },
    ...s.audit,
  ];
}

function markVisited<
  T extends { route: RouteStop[]; visits: Record<string, Visit>; salesmanId: string },
>(state: T, customerId: string, outcome: VisitOutcome): T {
  const now = new Date().toISOString();
  const existing = state.visits[customerId];
  return {
    ...state,
    route: state.route.map((r) =>
      r.customerId === customerId
        ? { ...r, status: 'visited', outcome }
        : r,
    ),
    visits: {
      ...state.visits,
      [customerId]: {
        ...(existing ?? blankVisit(state, customerId)),
        status: 'visited',
        outcome,
        endedAt: now,
      },
    },
  };
}

function blankVisit(
  state: { route: RouteStop[]; salesmanId: string },
  customerId: string,
): Visit {
  const stop = state.route.find((r) => r.customerId === customerId);
  return {
    id: uid('v'),
    routeStopId: stop?.id ?? '',
    customerId,
    salesmanId: state.salesmanId,
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    endedAt: null,
    outcome: null,
    checkInLat: null,
    checkInLng: null,
    notes: null,
  };
}

export const useSalesmanDay = create<SalesmanDayState>()(
  persist(
    (set, get) => ({
      ...initialState,

      openDay: () =>
        set((s) =>
          s.status === 'open'
            ? s
            : {
                status: 'open',
                openedAt: new Date().toISOString(),
                endedAt: null,
                audit: audit(s, 'open_day', 'Day opened'),
              },
        ),

      endDay: () =>
        set((s) => ({
          status: 'ended',
          endedAt: new Date().toISOString(),
          audit: audit(s, 'end_day', 'Day closed'),
        })),

      toggleOnline: () => set((s) => ({ online: !s.online })),

      startVisit: (customerId) =>
        set((s) => ({
          route: s.route.map((r) =>
            r.customerId === customerId && r.status === 'pending'
              ? { ...r, status: 'in_progress' }
              : r,
          ),
          visits: {
            ...s.visits,
            [customerId]: s.visits[customerId] ?? blankVisit(s, customerId),
          },
        })),

      recordNoSale: (customerId) =>
        set((s) => ({ ...markVisited(s, customerId, 'no_sale'), audit: audit(s, 'no_sale', customerId) })),

      createSale: (customerId, linesInput, paidNow, method) => {
        const s = get();
        const customer = s.customers[customerId];
        const lines = buildOrderLines(s.products, linesInput);
        const { subtotal, taxTotal, total } = summarize(lines);
        const paid = Math.min(round2(paidNow), total);
        const paymentStatus = paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
        const now = new Date().toISOString();
        const visit = s.visits[customerId];

        const order: SalesOrder = {
          id: uid('so'),
          number: `SO-${pad(s.orderSeq)}`,
          customerId,
          salesmanId: s.salesmanId,
          visitId: visit?.id ?? null,
          type: 'sale',
          status: 'invoiced',
          lines,
          subtotal,
          discountTotal: 0,
          taxTotal,
          total,
          createdAt: now,
        };

        const invoice: Invoice = {
          id: uid('inv'),
          number: `INV-${pad(s.orderSeq)}`,
          orderId: order.id,
          customerId,
          customerName: customer?.name ?? '',
          type: 'sale',
          lines: lines.map((l) => ({
            productId: l.productId,
            name: l.productName,
            nameAr: l.productNameAr,
            uom: l.uom,
            qty: l.qty,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
          })),
          subtotal,
          discountTotal: 0,
          taxTotal,
          total,
          paidAmount: paid,
          paymentStatus,
          createdAt: now,
        };

        set((st) => {
          // decrement van inventory (base units)
          const vanInventory = { ...st.vanInventory };
          for (const l of lines) {
            const inv = vanInventory[l.productId];
            if (inv) {
              vanInventory[l.productId] = {
                ...inv,
                qtyBase: Math.max(0, inv.qtyBase - l.qtyBase),
              };
            }
          }
          // update balance: credit portion increases outstanding
          const creditPortion = round2(Math.max(0, total - paid));
          const prevBal = st.balances[customerId];
          const balances = {
            ...st.balances,
            [customerId]: {
              ...prevBal,
              outstandingBalance: round2(prevBal.outstandingBalance + creditPortion),
              lastInvoiceDate: now.slice(0, 10),
              lastPaymentDate: paid > 0 ? now.slice(0, 10) : prevBal.lastPaymentDate,
              updatedAt: now,
            },
          };

          let next = {
            ...st,
            vanInventory,
            balances,
            orders: [order, ...st.orders],
            invoices: [invoice, ...st.invoices],
            orderSeq: st.orderSeq + 1,
            audit: audit(st, 'new_sale', `${invoice.number} · ${invoice.total} · ${invoice.customerName}`),
          };

          if (paid > 0) {
            const collection: Collection = {
              id: uid('col'),
              customerId,
              invoiceId: invoice.id,
              amount: paid,
              method,
              reference: null,
              createdAt: now,
            };
            next = { ...next, collections: [collection, ...next.collections] };
          }

          return markVisited(next, customerId, 'sale');
        });

        return invoice;
      },

      createReturn: (customerId, linesInput) => {
        const s = get();
        const customer = s.customers[customerId];
        const lines = buildOrderLines(s.products, linesInput);
        const { subtotal, taxTotal, total } = summarize(lines);
        const now = new Date().toISOString();

        const order: SalesOrder = {
          id: uid('so'),
          number: `RO-${pad(s.orderSeq)}`,
          customerId,
          salesmanId: s.salesmanId,
          visitId: s.visits[customerId]?.id ?? null,
          type: 'return',
          status: 'invoiced',
          lines,
          subtotal,
          discountTotal: 0,
          taxTotal,
          total,
          createdAt: now,
        };

        const invoice: Invoice = {
          id: uid('crn'),
          number: `CRN-${pad(s.orderSeq)}`,
          orderId: order.id,
          customerId,
          customerName: customer?.name ?? '',
          type: 'return',
          lines: lines.map((l) => ({
            productId: l.productId,
            name: l.productName,
            nameAr: l.productNameAr,
            uom: l.uom,
            qty: l.qty,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
          })),
          subtotal,
          discountTotal: 0,
          taxTotal,
          total,
          paidAmount: 0,
          paymentStatus: 'unpaid',
          createdAt: now,
        };

        set((st) => {
          const vanInventory = { ...st.vanInventory };
          for (const l of lines) {
            const inv = vanInventory[l.productId];
            if (inv) {
              vanInventory[l.productId] = { ...inv, qtyBase: inv.qtyBase + l.qtyBase };
            }
          }
          const next = {
            ...st,
            vanInventory,
            orders: [order, ...st.orders],
            invoices: [invoice, ...st.invoices],
            orderSeq: st.orderSeq + 1,
            audit: audit(st, 'return', `${invoice.number} · ${invoice.total}`),
          };
          return markVisited(next, customerId, 'return');
        });

        return invoice;
      },

      recordCollection: (customerId, amount, method, reference, invoiceId = null) => {
        const now = new Date().toISOString();
        const collection: Collection = {
          id: uid('col'),
          customerId,
          invoiceId,
          amount: round2(amount),
          method,
          reference,
          createdAt: now,
        };
        set((st) => {
          const prevBal = st.balances[customerId];
          const balances = {
            ...st.balances,
            [customerId]: {
              ...prevBal,
              outstandingBalance: round2(Math.max(0, prevBal.outstandingBalance - amount)),
              lastPaymentDate: now.slice(0, 10),
              updatedAt: now,
            },
          };
          const next = {
            ...st,
            balances,
            collections: [collection, ...st.collections],
            audit: audit(st, 'collection', `${amount} · ${st.customers[customerId]?.name ?? ''}`),
          };
          const stop = st.route.find((r) => r.customerId === customerId);
          return stop && stop.status !== 'visited'
            ? markVisited(next, customerId, 'collection')
            : next;
        });
        return collection;
      },

      resetDay: () => set({ ...initialState }),
    }),
    { name: 'vantora-salesman-day', version: 2 },
  ),
);

/** Flattened master + credit + balance for UI consumption. */
export function useCustomerView(customerId: string | undefined): CustomerView | null {
  return useSalesmanDay(
    useShallow((s) => {
      if (!customerId) return null;
      const customer = s.customers[customerId];
      const credit = s.creditLimits[customerId];
      const balance = s.balances[customerId];
      if (!customer || !credit || !balance) return null;
      return { customer, credit, balance };
    }),
  );
}
