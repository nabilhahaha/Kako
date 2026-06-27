// Validation pass: raw rows + mapping + policy -> issues (error/warning/info).
// Pure; the server persists the returned issues into import_issue.
import { normalizeDate, looksNumeric } from "@/lib/import/parse";
import { rawValue, textValue } from "@/lib/import/calc";
import { unsatisfiedRequirementGroups } from "@/lib/import/mapping";
import { FIELD_BY_KEY } from "@/lib/import/canonical-fields";
import type { CalcPolicy, FieldMapping, Issue } from "@/lib/import/types";

export type ValidateInput = {
  rows: { row_number: number; raw: Record<string, unknown> }[];
  fieldMapping: FieldMapping;
  policy: CalcPolicy;
  dateFormat: string;
  knownChannels: Set<string>; // lowercased source values resolvable to a channel
  knownCities: Set<string>;
};

export type ValidationResult = {
  issues: Issue[];
  errorCount: number;
  warningCount: number;
  validRows: number;
  excludedRows: number;
  unknownChannels: string[];
  unknownCities: string[];
  sampleSla: { row_number: number; sla: number | null }[];
};

const NUMERIC_REQUIRED = ["sales_value_excluding_vat"];

export function validate(input: ValidateInput): ValidationResult {
  const { rows, fieldMapping: fm, dateFormat } = input;
  const issues: Issue[] = [];
  const unknownChannels = new Set<string>();
  const unknownCities = new Set<string>();
  const seenLines = new Map<string, number>();
  let validRows = 0;
  let excludedRows = 0;

  // Mapping-level: unsatisfied requirement groups block commit.
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

  // Policy notes (info): subtracting a value we don't have a column for.
  if (input.policy.discount_handling === "subtract_cash_discount" && !fm.cash_discount) {
    issues.push({
      code: "POLICY_NO_DISCOUNT_COL",
      severity: "info",
      field: "cash_discount",
      row_number: null,
      message: "Policy subtracts cash discount but no discount column is mapped (treated as 0).",
      raw_value: null,
    });
  }
  if (input.policy.returns_handling === "subtract_returns_value" && !fm.returns_value) {
    issues.push({
      code: "POLICY_NO_RETURNS_COL",
      severity: "info",
      field: "returns_value",
      row_number: null,
      message: "Policy subtracts returns but no returns column is mapped (treated as 0).",
      raw_value: null,
    });
  }

  for (const { row_number, raw } of rows) {
    let rowExcluded = false;

    // Date parsing
    if (fm.invoice_date) {
      const dv = rawValue(raw, fm, "invoice_date");
      const dp = normalizeDate(dv, dateFormat);
      if (!dp.iso) {
        rowExcluded = true;
        issues.push({
          code: "DATE_UNPARSEABLE",
          severity: "warning",
          field: "invoice_date",
          row_number,
          message: `Invoice date could not be parsed (${dp.error}); row excluded.`,
          raw_value: dv == null ? null : String(dv),
        });
      } else if (dp.confidence < 80) {
        issues.push({
          code: "DATE_LOW_CONFIDENCE",
          severity: "warning",
          field: "invoice_date",
          row_number,
          message: "Invoice date parsed with low confidence; confirm the date format.",
          raw_value: dv == null ? null : String(dv),
        });
      }
    }

    // Numeric required fields
    for (const key of NUMERIC_REQUIRED) {
      if (!fm[key]) continue;
      const v = rawValue(raw, fm, key);
      if (v != null && String(v).trim() !== "" && !looksNumeric(v)) {
        issues.push({
          code: "NON_NUMERIC",
          severity: "warning",
          field: key,
          row_number,
          message: `${FIELD_BY_KEY[key]?.label ?? key} is not numeric.`,
          raw_value: String(v),
        });
      }
    }

    // Unknown channel / city (need value mapping)
    if (fm.channel) {
      const ch = textValue(raw, fm, "channel");
      if (ch && !input.knownChannels.has(ch.toLowerCase())) {
        unknownChannels.add(ch);
        issues.push({
          code: "UNKNOWN_CHANNEL",
          severity: "warning",
          field: "channel",
          row_number,
          message: `Channel "${ch}" has no value mapping yet.`,
          raw_value: ch,
        });
      }
    }
    if (fm.city) {
      const ct = textValue(raw, fm, "city");
      if (ct && !input.knownCities.has(ct.toLowerCase())) {
        unknownCities.add(ct);
        issues.push({
          code: "UNKNOWN_CITY",
          severity: "warning",
          field: "city",
          row_number,
          message: `City "${ct}" has no value mapping yet.`,
          raw_value: ct,
        });
      }
    }

    // Duplicate line within batch (invoice + item)
    const inv = textValue(raw, fm, "invoice_number");
    const item = textValue(raw, fm, "item_code") ?? textValue(raw, fm, "roshen_item_code") ?? textValue(raw, fm, "item_name");
    if (inv && item) {
      const k = `${inv}|${item}`;
      if (seenLines.has(k)) {
        issues.push({
          code: "DUPLICATE_LINE",
          severity: "warning",
          field: "invoice_number",
          row_number,
          message: `Duplicate line (invoice ${inv} / item ${item}) also at row ${seenLines.get(k)}.`,
          raw_value: k,
        });
      } else {
        seenLines.set(k, row_number);
      }
    }

    if (rowExcluded) excludedRows++;
    else validRows++;
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return {
    issues,
    errorCount,
    warningCount,
    validRows,
    excludedRows,
    unknownChannels: [...unknownChannels],
    unknownCities: [...unknownCities],
    sampleSla: [],
  };
}
