import * as XLSX from 'xlsx';

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: Record<string, string | number | null>[];
  totalRows: number;
}

const PREVIEW_ROWS = 10;

export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error('الملف لا يحتوي على أوراق عمل');
  }
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });

  const headers = json.length > 0 ? Object.keys(json[0]) : [];

  const normalizedRows = json.map((r) => {
    const out: Record<string, string | number | null> = {};
    for (const h of headers) {
      const v = r[h];
      if (v == null) {
        out[h] = null;
      } else if (typeof v === 'number') {
        out[h] = v;
      } else {
        out[h] = String(v);
      }
    }
    return out;
  });

  return {
    sheetName,
    headers,
    rows: normalizedRows.slice(0, PREVIEW_ROWS),
    totalRows: normalizedRows.length,
  };
}

export const STANDARD_FIELDS = [
  { key: 'invoice_number', label: 'رقم الفاتورة' },
  { key: 'invoice_date', label: 'تاريخ الفاتورة' },
  { key: 'customer_code', label: 'كود العميل' },
  { key: 'product_code', label: 'كود المنتج' },
  { key: 'quantity', label: 'الكمية' },
  { key: 'amount', label: 'القيمة' },
  { key: 'salesman_id', label: 'معرف المندوب' },
  { key: 'region', label: 'المنطقة' },
] as const;

export type StandardFieldKey = (typeof STANDARD_FIELDS)[number]['key'];
