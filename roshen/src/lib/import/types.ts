// Shared types for the raw-data import engine. Used on both client (parsing,
// mapping editor) and server (validation, commit). Kept dependency-free.
import type { Database } from "@/lib/database.types";

export type ImportMode = Database["public"]["Enums"]["import_mode"];
export type ImportStatus = Database["public"]["Enums"]["import_status"];
export type IssueSeverity = Database["public"]["Enums"]["issue_severity"];

/** A single canonical field mapping entry stored in field_mapping JSON. */
export type FieldMapEntry = {
  source: string; // source header name
  format?: string; // date format token for invoice_date
  fallback?: { source: string; format?: string };
};

/** field_mapping JSON: canonicalKey -> entry. */
export type FieldMapping = Record<string, FieldMapEntry>;

/** Calculation policy carried by a mapping version. */
export type CalcPolicy = {
  sales_value_basis: Database["public"]["Enums"]["sales_value_basis"];
  vat_handling: Database["public"]["Enums"]["vat_handling"];
  vat_rate: number;
  discount_handling: Database["public"]["Enums"]["discount_handling"];
  returns_handling: Database["public"]["Enums"]["returns_handling"];
  sla_actual_basis: Database["public"]["Enums"]["sla_actual_basis"];
};

export const DEFAULT_POLICY: CalcPolicy = {
  sales_value_basis: "excluding_vat_before_discount",
  vat_handling: "value_excludes_vat",
  vat_rate: 0.15,
  discount_handling: "subtract_cash_discount",
  returns_handling: "subtract_returns_value",
  sla_actual_basis: "net_sales_excluding_vat",
};

/** Parsed file analysis produced on stage 1 (client). */
export type SheetSummary = {
  name: string;
  rowCount: number;
  headers: string[];
};

export type ParsedFile = {
  filename: string;
  sizeBytes: number;
  sheets: SheetSummary[];
};

/** A raw row sent to the server to persist (raw jsonb + detected date). */
export type RawRowPayload = {
  row_number: number;
  raw: Record<string, unknown>;
  raw_invoice_date: string | null;
};

export type Issue = {
  code: string;
  severity: IssueSeverity;
  field: string | null;
  row_number: number | null;
  message: string;
  raw_value: string | null;
};
