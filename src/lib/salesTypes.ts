export interface SalesMeta {
  dateMin: string;
  dateMax: string;
  months: string[];
  generated: string;
  rows: number;
  processed: number;
  skipped: number;
}

export interface SalesDims {
  regions: string[];
  channels: string[];
  branches: string[];
  cities: string[];
  categories: string[];
  managers: string[];
  nsms: string[];
  supervisors: string[];
}

export interface SalesColumnarData {
  cu: number[];
  sk: number[];
  sm: number[];
  m: number[];
  d: number[];
  s: number[];
  q: number[];
  qx: number[];
  wg: number[];
  di: number[];
  r: number[];
  rc: number[];
}

export interface SalesCustomer {
  id: number;
  acct: string;
  n: string;
  ch: number;
  br: number;
  ci: number;
  rg: number;
  mg: number;
  sup: number;
  nsm: number;
  sm: number;
  first: string;
  last: string;
  inv: number;
  nsk: number;
  ts: number;
  tq: number;
}

export interface SalesSKU {
  id: number;
  iid: string;
  d: string;
  c: number;
}

export interface SalesSalesman {
  id: number;
  n: string;
  mg: number;
  br: number;
}

export interface SalesDataset {
  meta: SalesMeta;
  dims: SalesDims;
  data: SalesColumnarData;
  customers: SalesCustomer[];
  skus: SalesSKU[];
  salesmen: SalesSalesman[];
}

export interface SalesRow {
  customerIdx: number;
  skuIdx: number;
  salesmanIdx: number;
  monthIdx: number;
  dayOfYear: number;
  sales: number;
  qty: number;
  qtyUnits: number;
  weight: number;
  discount: number;
  isReturn: boolean;
  regionChannelIdx: number;
}

export interface SalesFilters {
  dateFrom: string | null;
  dateTo: string | null;
  regions: number[];
  channels: number[];
  branches: number[];
  cities: number[];
  categories: number[];
  managers: number[];
  nsms: number[];
  salesmen: number[];
  customers: number[];
  skus: number[];
}

export interface KPIData {
  totalSales: number;
  totalQuantity: number;
  totalWeight: number;
  totalDiscount: number;
  totalReturns: number;
  returnRate: number;
  avgOrderValue: number;
  uniqueCustomers: number;
  uniqueSKUs: number;
  uniqueSalesmen: number;
  transactionCount: number;
}

export interface MonthlySales {
  month: string;
  sales: number;
  qty: number;
  returns: number;
  customers: number;
}

export interface RegionSales {
  region: string;
  sales: number;
  qty: number;
  customers: number;
  salesmen: number;
}

export interface ProductSales {
  category: string;
  sales: number;
  qty: number;
  skuCount: number;
}

export interface SalesmanPerformance {
  name: string;
  sales: number;
  qty: number;
  customers: number;
  invoices: number;
  avgOrderValue: number;
}
