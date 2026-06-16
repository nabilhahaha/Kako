import type {
  CreditLimit,
  Customer,
  CustomerBalance,
  Product,
  RouteStop,
  VanInventory,
} from './types';

// Demo adapter: produces real domain instances so the workflow is reviewable
// on staging without a backend. Replace this module with API/Supabase loaders;
// the rest of the app consumes the typed entities only.

export const SEED_SALESMAN = {
  id: 'sm-1',
  name: 'Ahmed Al-Salem',
  nameAr: 'أحمد السالم',
  routeId: 'r-12',
  routeName: 'Riyadh North · Route R-12',
  routeNameAr: 'شمال الرياض · خط R-12',
};

// --- Products with Multi-UoM (piece / pack / case / carton) ----------------

function piecePackCase(
  piecePrice: number,
  packFactor: number,
  caseFactor: number,
): Product['uoms'] {
  return [
    {
      code: 'PIECE',
      name: 'Piece',
      nameAr: 'قطعة',
      factor: 1,
      price: piecePrice,
      barcode: null,
      isBaseUoM: true,
      isSalesDefault: false,
    },
    {
      code: 'PACK',
      name: 'Pack',
      nameAr: 'علبة',
      factor: packFactor,
      price: Math.round(piecePrice * packFactor * 0.98 * 100) / 100,
      barcode: null,
      isBaseUoM: false,
      isSalesDefault: false,
    },
    {
      code: 'CASE',
      name: 'Case',
      nameAr: 'كيس',
      factor: caseFactor,
      price: Math.round(piecePrice * caseFactor * 0.95 * 100) / 100,
      barcode: null,
      isBaseUoM: false,
      isSalesDefault: true,
    },
  ];
}

export const SEED_PRODUCTS: Product[] = [
  { id: 'p1', code: 'SKU-100', name: 'Cola 330ml', nameAr: 'كولا ٣٣٠مل', category: 'Beverages', taxRate: 0.15, isActive: true, baseUoM: 'PIECE', uoms: piecePackCase(1.8, 6, 24) },
  { id: 'p2', code: 'SKU-101', name: 'Water 600ml', nameAr: 'مياه ٦٠٠مل', category: 'Beverages', taxRate: 0.15, isActive: true, baseUoM: 'PIECE', uoms: piecePackCase(0.85, 12, 24) },
  { id: 'p3', code: 'SKU-102', name: 'Orange Juice 1L', nameAr: 'عصير برتقال ١ل', category: 'Beverages', taxRate: 0.15, isActive: true, baseUoM: 'PIECE', uoms: piecePackCase(7.5, 6, 12) },
  { id: 'p4', code: 'SKU-103', name: 'Potato Chips 30g', nameAr: 'شيبس ٣٠ج', category: 'Snacks', taxRate: 0.15, isActive: true, baseUoM: 'PIECE', uoms: piecePackCase(1.25, 12, 48) },
  { id: 'p5', code: 'SKU-104', name: 'Biscuits 50g', nameAr: 'بسكويت ٥٠ج', category: 'Snacks', taxRate: 0.15, isActive: true, baseUoM: 'PIECE', uoms: piecePackCase(0.95, 12, 36) },
  { id: 'p6', code: 'SKU-105', name: 'Energy Drink 250ml', nameAr: 'مشروب طاقة ٢٥٠مل', category: 'Beverages', taxRate: 0.15, isActive: true, baseUoM: 'PIECE', uoms: piecePackCase(4.2, 6, 24) },
];

export const SEED_VAN_INVENTORY: VanInventory[] = [
  { productId: 'p1', qtyBase: 24 * 120, reservedBase: 0 },
  { productId: 'p2', qtyBase: 24 * 200, reservedBase: 0 },
  { productId: 'p3', qtyBase: 12 * 80, reservedBase: 0 },
  { productId: 'p4', qtyBase: 48 * 60, reservedBase: 0 },
  { productId: 'p5', qtyBase: 36 * 90, reservedBase: 0 },
  { productId: 'p6', qtyBase: 24 * 40, reservedBase: 0 },
];

// --- Customers + credit + balance ------------------------------------------

export const SEED_CUSTOMERS: Customer[] = [
  { id: 'c1', code: 'CU-1001', name: 'Al Manara Supermarket', nameAr: 'سوبر ماركت المنارة', area: 'Al Olaya', areaAr: 'العليا', channel: 'MT', priceListId: null, lat: 24.6906, lng: 46.6857, isActive: true },
  { id: 'c2', code: 'CU-1002', name: 'Baqala Al Noor', nameAr: 'بقالة النور', area: 'Al Malaz', areaAr: 'الملز', channel: 'TT', priceListId: null, lat: 24.6748, lng: 46.7385, isActive: true },
  { id: 'c3', code: 'CU-1003', name: 'Hyper Panda - King Fahd Branch Distribution Center', nameAr: 'هايبر بنده - فرع الملك فهد', area: 'King Fahd', areaAr: 'الملك فهد', channel: 'MT', priceListId: null, lat: 24.7136, lng: 46.6753, isActive: true },
  { id: 'c4', code: 'CU-1004', name: 'Tamimi Markets', nameAr: 'أسواق التميمي', area: 'Al Wurud', areaAr: 'الورود', channel: 'MT', priceListId: null, lat: 24.7269, lng: 46.6531, isActive: true },
  { id: 'c5', code: 'CU-1005', name: 'Carrefour Express', nameAr: 'كارفور إكسبريس', area: 'Al Nakheel', areaAr: 'النخيل', channel: 'MT', priceListId: null, lat: 24.7445, lng: 46.6285, isActive: true },
  { id: 'c6', code: 'CU-1006', name: 'Baqala Al Salam', nameAr: 'بقالة السلام', area: 'Al Rawdah', areaAr: 'الروضة', channel: 'TT', priceListId: null, lat: 24.7702, lng: 46.7559, isActive: true },
];

export const SEED_CREDIT_LIMITS: CreditLimit[] = [
  { customerId: 'c1', creditLimit: 20000, allowedOverdueDays: 30, cashOnly: false, currency: 'SAR' },
  { customerId: 'c2', creditLimit: 0, allowedOverdueDays: 0, cashOnly: true, currency: 'SAR' },
  { customerId: 'c3', creditLimit: 50000, allowedOverdueDays: 45, cashOnly: false, currency: 'SAR' },
  { customerId: 'c4', creditLimit: 30000, allowedOverdueDays: 30, cashOnly: false, currency: 'SAR' },
  { customerId: 'c5', creditLimit: 15000, allowedOverdueDays: 30, cashOnly: false, currency: 'SAR' },
  { customerId: 'c6', creditLimit: 8000, allowedOverdueDays: 30, cashOnly: false, currency: 'SAR' },
];

export const SEED_BALANCES: CustomerBalance[] = [
  { customerId: 'c1', outstandingBalance: 4200, overdueAmount: 0, overdueDays: 0, lastInvoiceDate: '2026-06-08', lastPaymentDate: '2026-06-08', updatedAt: '2026-06-08' },
  { customerId: 'c2', outstandingBalance: 0, overdueAmount: 0, overdueDays: 0, lastInvoiceDate: '2026-06-12', lastPaymentDate: '2026-06-12', updatedAt: '2026-06-12' },
  // exceeded credit limit
  { customerId: 'c3', outstandingBalance: 51200, overdueAmount: 12000, overdueDays: 12, lastInvoiceDate: '2026-05-30', lastPaymentDate: '2026-05-10', updatedAt: '2026-05-30' },
  // overdue beyond allowed days (41 > 30)
  { customerId: 'c4', outstandingBalance: 8000, overdueAmount: 8000, overdueDays: 41, lastInvoiceDate: '2026-04-25', lastPaymentDate: '2026-04-01', updatedAt: '2026-04-25' },
  { customerId: 'c5', outstandingBalance: 2500, overdueAmount: 0, overdueDays: 0, lastInvoiceDate: '2026-06-10', lastPaymentDate: '2026-06-10', updatedAt: '2026-06-10' },
  { customerId: 'c6', outstandingBalance: 0, overdueAmount: 0, overdueDays: 0, lastInvoiceDate: null, lastPaymentDate: null, updatedAt: '2026-06-01' },
];

export const SEED_ROUTE: RouteStop[] = SEED_CUSTOMERS.map((c, i) => ({
  id: `rs-${i + 1}`,
  routeId: SEED_SALESMAN.routeId,
  customerId: c.id,
  sequence: i + 1,
  plannedArrival: null,
  status: 'pending',
  outcome: null,
}));
