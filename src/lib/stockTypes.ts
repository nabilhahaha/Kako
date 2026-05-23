export interface StockBatch {
  sku: string;
  wh: string;
  batch: string;
  expiry: string | null;
  mfg: string | null;
  qty: number;
  reserved: number;
  cases: number;
  itemStatus: string;
  subInv: string;
}

export interface StockData {
  snapshots: Record<string, StockBatch[]>;
  skuInfo: Record<string, { name: string; cat: string }>;
  version?: string;
  savedAt?: string;
}
