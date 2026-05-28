export interface LineInput {
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_rate: number;
}

export interface ComputedLine extends LineInput {
  gross: number;
  discount: number;
  net: number;
  tax: number;
}

export interface DocumentTotals {
  total_amount: number; // gross subtotal (before discount, before tax)
  discount_amount: number; // sum of line discounts
  tax_amount: number; // sum of line tax
  net_amount: number; // total - discount + tax (what the customer owes)
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeLine(line: LineInput): ComputedLine {
  const gross = round2(line.quantity * line.unit_price);
  const discount = round2((gross * line.discount_pct) / 100);
  const net = round2(gross - discount);
  const tax = round2((net * line.tax_rate) / 100);
  return { ...line, gross, discount, net, tax };
}

export function computeTotals(lines: LineInput[]): DocumentTotals {
  const computed = lines.map(computeLine);
  const total_amount = round2(computed.reduce((s, l) => s + l.gross, 0));
  const discount_amount = round2(computed.reduce((s, l) => s + l.discount, 0));
  const tax_amount = round2(computed.reduce((s, l) => s + l.tax, 0));
  const net_amount = round2(total_amount - discount_amount + tax_amount);
  return { total_amount, discount_amount, tax_amount, net_amount };
}
