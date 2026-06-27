// Validation pass: raw rows + mapping + policy -> issues (error/warning/info).
// Used for BOTH quick validation (small sample) and chunked full validation.
// Pure; the server persists/aggregates the returned issues.
import { normalizeDate, looksNumeric } from "@/lib/import/parse";
import { rawValue, textValue } from "@/lib/import/calc";
import { unsatisfiedRequirementGroups } from "@/lib/import/mapping";
import type { CalcPolicy, FieldMapping, Issue } from "@/lib/import/types";

export type ValidateInput = {
  rows: { row_number: number; raw: Record<string, unknown> }[];
  fieldMapping: FieldMapping;
  policy: CalcPolicy;
  dateFormat: string;
  knownChannels: Set<string>;
  knownCities: Set<string>;
  /** Include mapping-level checks (requirement groups, policy notes). */
  mappingLevel?: boolean;
};

export type ValidationResult = {
  issues: Issue[];
  errorCount: number;
  warningCount: number;
  validRows: number;
  excludedRows: number;
  unknownChannels: string[];
  unknownCities: string[];
};

// Blocking error codes (stop commit) vs warning codes (allow).
export const BLOCKING_CODES = [
  "MISSING_REQUIRED_GROUP",
  "MISSING_INVOICE_NUMBER",
  "MISSING_INVOICE_DATE",
  "DATE_UNPARSEABLE",
  "MISSING_CUSTOMER",
  "MISSING_ITEM",
  "MISSING_SALES_VALUE",
  "INVALID_SALES_VALUE",
];

export function validate(input: ValidateInput): ValidationResult {
  const { rows, fieldMapping: fm, dateFormat, mappingLevel = true } = input;
  const issues: Issue[] = [];
  const unknownChannels = new Set<string>();
  const unknownCities = new Set<string>();
  const seenLines = new Map<string, number>();
  let validRows = 0;
  let excludedRows = 0;

  if (mappingLevel) {
    for (const g of unsatisfiedRequirementGroups(fm)) {
      issues.push({
        code: "MISSING_REQUIRED_GROUP",
        severity: "error",
        field: g.id,
        row_number: null,
        message: `Required field group not mapped: ${g.label}.`,
        raw_value: null,
      });
    }
    if (input.policy.discount_handling === "subtract_cash_discount" && !fm.cash_discount) {
      issues.push({ code: "POLICY_NO_DISCOUNT_COL", severity: "info", field: "cash_discount", row_number: null, message: "Policy subtracts cash discount but no discount column is mapped (treated as 0).", raw_value: null });
    }
    if (input.policy.returns_handling === "subtract_returns_value" && !fm.returns_value) {
      issues.push({ code: "POLICY_NO_RETURNS_COL", severity: "info", field: "returns_value", row_number: null, message: "Policy subtracts returns but no returns column is mapped (treated as 0).", raw_value: null });
    }
  }

  for (const { row_number, raw } of rows) {
    let blocked = false;
    const err = (code: string, field: string, message: string, rawVal?: string | null) => {
      blocked = true;
      issues.push({ code, severity: "error", field, row_number, message, raw_value: rawVal ?? null });
    };
    const warn = (code: string, field: string, message: string, rawVal?: string | null) => {
      issues.push({ code, severity: "warning", field, row_number, message, raw_value: rawVal ?? null });
    };

    // --- Blocking: required values present per row ---
    if (fm.invoice_number && !textValue(raw, fm, "invoice_number")) err("MISSING_INVOICE_NUMBER", "invoice_number", "Invoice number is empty.");

    if (fm.invoice_date) {
      const dv = rawValue(raw, fm, "invoice_date");
      if (dv == null || String(dv).trim() === "") {
        err("MISSING_INVOICE_DATE", "invoice_date", "Invoice date is empty.");
      } else {
        const dp = normalizeDate(dv, dateFormat);
        if (!dp.iso) err("DATE_UNPARSEABLE", "invoice_date", `Invoice date could not be parsed (${dp.error}).`, String(dv));
        else if (dp.confidence < 80) warn("DATE_LOW_CONFIDENCE", "invoice_date", "Invoice date parsed with low confidence; confirm the date format.", String(dv));
      }
    }

    const custCode = fm.customer_code ? textValue(raw, fm, "customer_code") : null;
    const custName = fm.customer_name ? textValue(raw, fm, "customer_name") : null;
    if ((fm.customer_code || fm.customer_name) && !custCode && !custName) err("MISSING_CUSTOMER", "customer", "Customer code and name are both empty.");

    const itemCode = fm.item_code ? textValue(raw, fm, "item_code") : null;
    const itemName = fm.item_name ? textValue(raw, fm, "item_name") : null;
    const roshen = fm.roshen_item_code ? textValue(raw, fm, "roshen_item_code") : null;
    if ((fm.item_code || fm.item_name || fm.roshen_item_code) && !itemCode && !itemName && !roshen) err("MISSING_ITEM", "item", "Item code and name are both empty.");

    if (fm.sales_value_excluding_vat) {
      const sv = rawValue(raw, fm, "sales_value_excluding_vat");
      if (sv == null || String(sv).trim() === "") err("MISSING_SALES_VALUE", "sales_value_excluding_vat", "Sales value is empty.");
      else if (!looksNumeric(sv)) err("INVALID_SALES_VALUE", "sales_value_excluding_vat", "Sales value is not numeric.", String(sv));
    }

    // --- Warnings ---
    if (fm.channel) {
      const ch = textValue(raw, fm, "channel");
      if (ch && !input.knownChannels.has(ch.toLowerCase())) {
        unknownChannels.add(ch);
        warn("UNKNOWN_CHANNEL", "channel", `Channel "${ch}" has no value mapping yet.`, ch);
      }
    }
    if (fm.city) {
      const ct = textValue(raw, fm, "city");
      if (ct && !input.knownCities.has(ct.toLowerCase())) {
        unknownCities.add(ct);
        warn("UNKNOWN_CITY", "city", `City "${ct}" has no value mapping yet.`, ct);
      }
    }
    const inv = textValue(raw, fm, "invoice_number");
    const item = itemCode ?? roshen ?? itemName;
    if (inv && item) {
      const k = `${inv}|${item}`;
      if (seenLines.has(k)) warn("DUPLICATE_LINE", "invoice_number", `Duplicate line (invoice ${inv} / item ${item}) also at row ${seenLines.get(k)}.`, k);
      else seenLines.set(k, row_number);
    }

    if (blocked) excludedRows++;
    else validRows++;
  }

  return {
    issues,
    errorCount: issues.filter((i) => i.severity === "error").length,
    warningCount: issues.filter((i) => i.severity === "warning").length,
    validRows,
    excludedRows,
    unknownChannels: [...unknownChannels],
    unknownCities: [...unknownCities],
  };
}
