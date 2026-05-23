import type {
  SalesDataset,
  SalesFilters,
  KPIData,
  MonthlySales,
  RegionSales,
  ProductSales,
  SalesmanPerformance,
} from './salesTypes';

const DAY_BASE = new Date('2025-01-01').getTime();
const MS_PER_DAY = 86400000;

export function dayIndexToDate(d: number): Date {
  return new Date(DAY_BASE + d * MS_PER_DAY);
}

export function dateToString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dayIndexToString(d: number): string {
  return dateToString(dayIndexToDate(d));
}

export function stringToDayIndex(s: string): number {
  return Math.round((new Date(s).getTime() - DAY_BASE) / MS_PER_DAY);
}

export function buildFilteredIndices(
  ds: SalesDataset,
  filters: SalesFilters
): Uint32Array {
  const { data, customers, skus } = ds;
  const len = data.cu.length;

  const dateFromIdx = filters.dateFrom ? stringToDayIndex(filters.dateFrom) : -Infinity;
  const dateToIdx = filters.dateTo ? stringToDayIndex(filters.dateTo) : Infinity;

  const regionSet = filters.regions.length ? new Set(filters.regions) : null;
  const channelSet = filters.channels.length ? new Set(filters.channels) : null;
  const branchSet = filters.branches.length ? new Set(filters.branches) : null;
  const citySet = filters.cities.length ? new Set(filters.cities) : null;
  const categorySet = filters.categories.length ? new Set(filters.categories) : null;
  const managerSet = filters.managers.length ? new Set(filters.managers) : null;
  const nsmSet = filters.nsms.length ? new Set(filters.nsms) : null;
  const salesmanSet = filters.salesmen.length ? new Set(filters.salesmen) : null;
  const customerSet = filters.customers.length ? new Set(filters.customers) : null;
  const skuSet = filters.skus.length ? new Set(filters.skus) : null;

  const result: number[] = [];

  for (let i = 0; i < len; i++) {
    const d = data.d[i];
    if (d < dateFromIdx || d > dateToIdx) continue;

    const cuIdx = data.cu[i];
    const cu = customers[cuIdx];

    if (regionSet && !regionSet.has(cu.rg)) continue;
    if (channelSet && !channelSet.has(cu.ch)) continue;
    if (branchSet && !branchSet.has(cu.br)) continue;
    if (citySet && !citySet.has(cu.ci)) continue;
    if (managerSet && !managerSet.has(cu.mg)) continue;
    if (nsmSet && !nsmSet.has(cu.nsm)) continue;
    if (salesmanSet && !salesmanSet.has(data.sm[i])) continue;
    if (customerSet && !customerSet.has(cuIdx)) continue;

    const skIdx = data.sk[i];
    if (categorySet && !categorySet.has(skus[skIdx].c)) continue;
    if (skuSet && !skuSet.has(skIdx)) continue;

    result.push(i);
  }

  return new Uint32Array(result);
}

export function computeKPIs(ds: SalesDataset, indices: Uint32Array): KPIData {
  const { data } = ds;
  let totalSales = 0;
  let totalQuantity = 0;
  let totalWeight = 0;
  let totalDiscount = 0;
  let totalReturns = 0;
  const customerSet = new Set<number>();
  const skuSet = new Set<number>();
  const salesmanSet = new Set<number>();

  for (const i of indices) {
    const s = data.s[i];
    const isReturn = data.r[i] === 1;

    if (isReturn) {
      totalReturns += Math.abs(s);
    } else {
      totalSales += s;
    }
    totalQuantity += data.q[i];
    totalWeight += data.wg[i];
    totalDiscount += Math.abs(data.di[i]);
    customerSet.add(data.cu[i]);
    skuSet.add(data.sk[i]);
    salesmanSet.add(data.sm[i]);
  }

  const salesOnly = indices.length > 0
    ? Array.from(indices).filter(i => data.r[i] === 0).length
    : 0;

  return {
    totalSales,
    totalQuantity,
    totalWeight,
    totalDiscount,
    totalReturns,
    returnRate: totalSales > 0 ? (totalReturns / (totalSales + totalReturns)) * 100 : 0,
    avgOrderValue: salesOnly > 0 ? totalSales / salesOnly : 0,
    uniqueCustomers: customerSet.size,
    uniqueSKUs: skuSet.size,
    uniqueSalesmen: salesmanSet.size,
    transactionCount: indices.length,
  };
}

export function computeMonthlySales(
  ds: SalesDataset,
  indices: Uint32Array
): MonthlySales[] {
  const { data, meta } = ds;
  const months = meta.months;
  const salesByMonth = new Float64Array(months.length);
  const qtyByMonth = new Float64Array(months.length);
  const returnsByMonth = new Float64Array(months.length);
  const customersByMonth: Set<number>[] = months.map(() => new Set());

  for (const i of indices) {
    const m = data.m[i];
    const isReturn = data.r[i] === 1;
    if (isReturn) {
      returnsByMonth[m] += Math.abs(data.s[i]);
    } else {
      salesByMonth[m] += data.s[i];
    }
    qtyByMonth[m] += data.q[i];
    customersByMonth[m].add(data.cu[i]);
  }

  return months.map((month, idx) => ({
    month,
    sales: salesByMonth[idx],
    qty: qtyByMonth[idx],
    returns: returnsByMonth[idx],
    customers: customersByMonth[idx].size,
  }));
}

export function computeRegionSales(
  ds: SalesDataset,
  indices: Uint32Array
): RegionSales[] {
  const { data, dims, customers } = ds;
  const regions = dims.regions;
  const salesByRegion = new Float64Array(regions.length);
  const qtyByRegion = new Float64Array(regions.length);
  const customersByRegion: Set<number>[] = regions.map(() => new Set());
  const salesmenByRegion: Set<number>[] = regions.map(() => new Set());

  for (const i of indices) {
    if (data.r[i] === 1) continue;
    const cu = customers[data.cu[i]];
    const rg = cu.rg;
    salesByRegion[rg] += data.s[i];
    qtyByRegion[rg] += data.q[i];
    customersByRegion[rg].add(data.cu[i]);
    salesmenByRegion[rg].add(data.sm[i]);
  }

  return regions
    .map((region, idx) => ({
      region,
      sales: salesByRegion[idx],
      qty: qtyByRegion[idx],
      customers: customersByRegion[idx].size,
      salesmen: salesmenByRegion[idx].size,
    }))
    .filter(r => r.sales > 0)
    .sort((a, b) => b.sales - a.sales);
}

export function computeProductSales(
  ds: SalesDataset,
  indices: Uint32Array
): ProductSales[] {
  const { data, dims, skus } = ds;
  const categories = dims.categories;
  const salesByCat = new Float64Array(categories.length);
  const qtyByCat = new Float64Array(categories.length);
  const skusByCat: Set<number>[] = categories.map(() => new Set());

  for (const i of indices) {
    if (data.r[i] === 1) continue;
    const sk = skus[data.sk[i]];
    const c = sk.c;
    salesByCat[c] += data.s[i];
    qtyByCat[c] += data.q[i];
    skusByCat[c].add(data.sk[i]);
  }

  return categories
    .map((category, idx) => ({
      category,
      sales: salesByCat[idx],
      qty: qtyByCat[idx],
      skuCount: skusByCat[idx].size,
    }))
    .filter(p => p.sales > 0)
    .sort((a, b) => b.sales - a.sales);
}

export function computeSalesmanPerformance(
  ds: SalesDataset,
  indices: Uint32Array
): SalesmanPerformance[] {
  const { data, salesmen } = ds;
  const salesBySm = new Float64Array(salesmen.length);
  const qtyBySm = new Float64Array(salesmen.length);
  const customersBySm: Set<number>[] = salesmen.map(() => new Set());
  const invoicesBySm = new Float64Array(salesmen.length);

  for (const i of indices) {
    if (data.r[i] === 1) continue;
    const sm = data.sm[i];
    salesBySm[sm] += data.s[i];
    qtyBySm[sm] += data.q[i];
    customersBySm[sm].add(data.cu[i]);
    invoicesBySm[sm]++;
  }

  return salesmen
    .map((sm, idx) => ({
      name: sm.n,
      sales: salesBySm[idx],
      qty: qtyBySm[idx],
      customers: customersBySm[idx].size,
      invoices: invoicesBySm[idx],
      avgOrderValue: invoicesBySm[idx] > 0 ? salesBySm[idx] / invoicesBySm[idx] : 0,
    }))
    .filter(s => s.sales > 0)
    .sort((a, b) => b.sales - a.sales);
}

export function computeChannelSales(
  ds: SalesDataset,
  indices: Uint32Array
): { channel: string; sales: number; qty: number; customers: number }[] {
  const { data, dims, customers } = ds;
  const channels = dims.channels;
  const salesByCh = new Float64Array(channels.length);
  const qtyByCh = new Float64Array(channels.length);
  const customersByCh: Set<number>[] = channels.map(() => new Set());

  for (const i of indices) {
    if (data.r[i] === 1) continue;
    const cu = customers[data.cu[i]];
    const ch = cu.ch;
    salesByCh[ch] += data.s[i];
    qtyByCh[ch] += data.q[i];
    customersByCh[ch].add(data.cu[i]);
  }

  return channels
    .map((channel, idx) => ({
      channel,
      sales: salesByCh[idx],
      qty: qtyByCh[idx],
      customers: customersByCh[idx].size,
    }))
    .filter(c => c.sales > 0)
    .sort((a, b) => b.sales - a.sales);
}

export function formatSAR(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return (n / 1_000_000).toFixed(2) + 'M SAR';
  }
  if (Math.abs(n) >= 1_000) {
    return (n / 1_000).toFixed(1) + 'K SAR';
  }
  return n.toFixed(0) + ' SAR';
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function formatPercent(n: number): string {
  return n.toFixed(1) + '%';
}
