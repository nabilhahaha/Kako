// Sales calculation policy resolution (per docs/MAPPING-ENGINE.md §5).
// Pure functions: raw row + field_mapping + policy -> sales_fact measures.
import { num } from "@/lib/import/parse";
import type { CalcPolicy, FieldMapping } from "@/lib/import/types";

/** Read a canonical field's raw source value from a raw row. */
export function rawValue(raw: Record<string, unknown>, fm: FieldMapping, key: string): unknown {
  const e = fm[key];
  if (!e) return null;
  const primary = raw[e.source];
  if ((primary == null || primary === "") && e.fallback) return raw[e.fallback.source];
  return primary;
}

export function textValue(raw: Record<string, unknown>, fm: FieldMapping, key: string): string | null {
  const v = rawValue(raw, fm, key);
  return v == null || String(v).trim() === "" ? null : String(v).trim();
}

export type ResolvedMeasures = {
  source_sales_value: number;
  sales_value_excl_vat: number | null;
  gross_value: number | null;
  net_value_reported: number | null;
  vat_amount: number | null;
  cash_discount: number;
  returns_value: number;
  gross_sales_ex_vat: number | null;
  net_sales_ex_vat: number | null;
  sla_actual_value: number | null;
};

/**
 * Apply the calculation policy to one row's canonical numeric inputs.
 * Mirrors the documented resolution order (VAT → gross → net → sla basis).
 */
export function computeMeasures(
  raw: Record<string, unknown>,
  fm: FieldMapping,
  policy: CalcPolicy,
): ResolvedMeasures {
  const source = num(rawValue(raw, fm, "sales_value_excluding_vat"));
  const reportedNet = fm.net_value_after_discount ? num(rawValue(raw, fm, "net_value_after_discount")) : null;
  const grossSrc = fm.gross_value_before_discount ? num(rawValue(raw, fm, "gross_value_before_discount")) : null;
  const vat = fm.vat_amount ? num(rawValue(raw, fm, "vat_amount")) : null;
  const cash_discount = fm.cash_discount ? num(rawValue(raw, fm, "cash_discount")) : 0;
  const returns_value = fm.returns_value ? num(rawValue(raw, fm, "returns_value")) : 0;

  // 1. VAT → ex-VAT base value
  let exVat = source;
  if (policy.vat_handling === "value_includes_vat" && policy.vat_rate > 0) {
    exVat = source / (1 + policy.vat_rate);
  }

  // 2. gross_sales_ex_vat (normalize to before-discount)
  let gross = exVat;
  const basisAfterDiscount =
    policy.sales_value_basis === "net_after_discount" ||
    policy.sales_value_basis === "excluding_vat_after_discount" ||
    policy.sales_value_basis === "net_after_returns_excluding_vat";
  if (grossSrc != null) {
    gross = grossSrc;
  } else if (basisAfterDiscount && cash_discount) {
    gross = exVat + cash_discount; // add discount back to reach gross
  }

  // 3. net_sales_ex_vat = gross − (cash discount?) − (returns?)
  let net = gross;
  if (policy.discount_handling === "subtract_cash_discount") net -= cash_discount;
  if (policy.returns_handling === "subtract_returns_value") net -= returns_value;

  // 4. sla_actual_value selected by basis
  let sla: number | null;
  switch (policy.sla_actual_basis) {
    case "gross_sales_excluding_vat": sla = gross; break;
    case "sales_value_excluding_vat": sla = exVat; break;
    case "net_sales_excluding_vat": sla = net; break;
    default: sla = net; // custom_formula_later → fall back to net for MVP
  }

  return {
    source_sales_value: source,
    sales_value_excl_vat: exVat,
    gross_value: grossSrc,
    net_value_reported: reportedNet,
    vat_amount: vat,
    cash_discount,
    returns_value,
    gross_sales_ex_vat: gross,
    net_sales_ex_vat: net,
    sla_actual_value: sla,
  };
}

/** A short human description of the policy for the preview screen. */
export function describePolicy(policy: CalcPolicy): string {
  const basis: Record<string, string> = {
    sales_value_excluding_vat: "Sales value excl. VAT",
    net_sales_excluding_vat: "Net sales excl. VAT (− discount − returns)",
    gross_sales_excluding_vat: "Gross sales excl. VAT",
    custom_formula_later: "Custom (net for now)",
  };
  return `SLA actual = ${basis[policy.sla_actual_basis] ?? policy.sla_actual_basis}; VAT ${
    policy.vat_handling === "value_includes_vat" ? `included @ ${Math.round(policy.vat_rate * 100)}%` : "excluded"
  }.`;
}
