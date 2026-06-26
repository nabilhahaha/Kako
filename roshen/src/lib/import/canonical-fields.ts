// Canonical target fields for the mapping engine. Format-agnostic: any agent
// raw column maps TO one of these keys. Tiers + requirement groups come from
// docs/IMPORT-COMPATIBILITY.md and docs/MAPPING-ENGINE.md. `synonyms` drive the
// fuzzy auto-mapping / confidence score (header text is normalized first).

export type FieldTier = "required" | "recommended" | "optional";
export type FieldGroup =
  | "identity"
  | "customer"
  | "item"
  | "value"
  | "quantity"
  | "returns"
  | "location"
  | "people"
  | "meta";

export type CanonicalField = {
  key: string;
  label: string;
  tier: FieldTier;
  group: FieldGroup;
  /** Lowercased header variants used for auto-mapping. */
  synonyms: string[];
  numeric?: boolean;
  date?: boolean;
};

export const CANONICAL_FIELDS: CanonicalField[] = [
  // identity
  { key: "invoice_number", label: "Invoice Number", tier: "required", group: "identity", synonyms: ["invoice", "invoice no", "invoice number", "inv", "inv no", "invoice_key", "doc id", "document number", "bill no"] },
  { key: "invoice_date", label: "Invoice Date", tier: "required", group: "identity", date: true, synonyms: ["invoice date", "inv date", "date", "posting date", "doc date", "trans date", "transaction date"] },
  { key: "transaction_type", label: "Transaction Type", tier: "optional", group: "identity", synonyms: ["transaction type", "txn type", "doc type", "document type", "isreturn", "is return", "type", "so/return"] },
  { key: "invoice_status", label: "Invoice Status", tier: "optional", group: "identity", synonyms: ["invoice status", "order status", "line status", "status", "posted"] },
  { key: "credit_note_number", label: "Credit Note Number", tier: "optional", group: "identity", synonyms: ["credit note", "credit note number", "cn no", "rma", "so/rma"] },
  { key: "reporting_month", label: "Reporting Month", tier: "optional", group: "identity", synonyms: ["reporting month", "month", "invoice month", "period"] },

  // customer
  { key: "customer_code", label: "Customer Code", tier: "required", group: "customer", synonyms: ["customer code", "cust account", "customer account", "cust code", "account", "customer id", "cust id"] },
  { key: "customer_name", label: "Customer Name", tier: "required", group: "customer", synonyms: ["customer name", "cust name", "customer", "client name", "account name"] },

  // item
  { key: "item_code", label: "Item Code", tier: "required", group: "item", synonyms: ["item code", "item id", "sku", "product code", "material", "item number"] },
  { key: "item_name", label: "Item Name", tier: "required", group: "item", synonyms: ["item name", "item description", "product name", "description", "material description"] },
  { key: "roshen_item_code", label: "Roshen Item Code", tier: "recommended", group: "item", synonyms: ["roshen item code", "roshen code", "master code", "roshen sku"] },
  { key: "item_category", label: "Item Category", tier: "optional", group: "item", synonyms: ["item category", "item type", "category", "item group"] },
  { key: "brand", label: "Brand", tier: "optional", group: "item", synonyms: ["brand"] },
  { key: "product_family", label: "Product Family", tier: "optional", group: "item", synonyms: ["product family", "family", "division", "class"] },
  { key: "barcode", label: "Barcode", tier: "optional", group: "item", synonyms: ["barcode", "ean", "upc"] },
  { key: "unit_of_measure", label: "Unit of Measure", tier: "optional", group: "item", synonyms: ["unit of measure", "uom", "salesunit", "sales unit", "unit"] },
  { key: "carton_to_piece_conversion", label: "Carton→Piece Factor", tier: "optional", group: "item", numeric: true, synonyms: ["carton to piece", "conversion", "pieces per carton", "pack size", "factor"] },

  // value
  { key: "sales_value_excluding_vat", label: "Sales Value (excl. VAT)", tier: "required", group: "value", numeric: true, synonyms: ["sales value ex vat", "invoice amount ex vat", "amount ex vat", "ex vat", "value excl vat", "net amount ex vat", "sales value"] },
  { key: "net_value_after_discount", label: "Net Value (after discount)", tier: "optional", group: "value", numeric: true, synonyms: ["net amount", "net value", "net sales value", "netsalsevalue", "net sales"] },
  { key: "gross_value_before_discount", label: "Gross Value (before discount)", tier: "optional", group: "value", numeric: true, synonyms: ["gross sales", "gross value", "gross amount", "gross"] },
  { key: "vat_amount", label: "VAT Amount", tier: "recommended", group: "value", numeric: true, synonyms: ["vat", "vat amount", "sales_total_tax", "tax", "tax amount"] },
  { key: "cash_discount", label: "Cash / Line Discount", tier: "required", group: "value", numeric: true, synonyms: ["discount", "total line discount", "cash discount", "line discount", "discount amount"] },

  // quantity
  { key: "sales_qty_cartons", label: "Sales Qty (cartons)", tier: "required", group: "quantity", numeric: true, synonyms: ["qty cartons", "inv qty cases", "cases", "cartons", "carton qty", "quantity cartons"] },
  { key: "sales_qty_pieces", label: "Sales Qty (pieces)", tier: "required", group: "quantity", numeric: true, synonyms: ["qty pieces", "inv qty each", "each", "pieces", "pcs", "quantity pieces", "units"] },

  // returns
  { key: "returns_value", label: "Returns Value", tier: "required", group: "returns", numeric: true, synonyms: ["returns value", "return value", "return amount", "returns"] },
  { key: "return_reason", label: "Return Reason", tier: "optional", group: "returns", synonyms: ["return reason", "reason", "return type"] },
  { key: "return_qty_cartons", label: "Return Qty (cartons)", tier: "optional", group: "returns", numeric: true, synonyms: ["return qty cartons", "returned cases", "return cartons"] },
  { key: "return_qty_pieces", label: "Return Qty (pieces)", tier: "optional", group: "returns", numeric: true, synonyms: ["return qty pieces", "returned each", "return pieces"] },

  // location
  { key: "channel", label: "Channel", tier: "required", group: "location", synonyms: ["channel", "trade channel", "sales channel", "customer classification"] },
  { key: "city", label: "City", tier: "required", group: "location", synonyms: ["city", "depot", "town", "location"] },
  { key: "region", label: "Region", tier: "optional", group: "location", synonyms: ["region"] },
  { key: "area", label: "Area", tier: "optional", group: "location", synonyms: ["area", "territory"] },
  { key: "branch_code", label: "Branch Code", tier: "optional", group: "location", synonyms: ["branch code", "branch", "depot code", "warehouse", "site"] },
  { key: "branch_name", label: "Branch Name", tier: "optional", group: "location", synonyms: ["branch name", "depot name", "warehouse name"] },
  { key: "route_number", label: "Route Number", tier: "optional", group: "location", synonyms: ["route", "route number", "route no", "warehouse"] },

  // people
  { key: "salesman_name", label: "Salesman Name", tier: "recommended", group: "people", synonyms: ["salesman", "salesman name", "sales man", "sales rep", "rep"] },
  { key: "agent_code", label: "Agent / Distributor Code", tier: "optional", group: "people", synonyms: ["agent code", "distributor code", "agent id"] },
  { key: "agent_name", label: "Agent / Distributor Name", tier: "optional", group: "people", synonyms: ["agent name", "distributor name", "agent", "distributor"] },
];

export const FIELD_BY_KEY: Record<string, CanonicalField> = Object.fromEntries(
  CANONICAL_FIELDS.map((f) => [f.key, f]),
);

// Requirement groups: each group is satisfied if ANY of its members is mapped.
// A group missing entirely BLOCKS commit. (docs/IMPORT-COMPATIBILITY.md)
export const REQUIREMENT_GROUPS: { id: string; label: string; anyOf: string[] }[] = [
  { id: "invoice_number", label: "Invoice number", anyOf: ["invoice_number"] },
  { id: "invoice_date", label: "Invoice date", anyOf: ["invoice_date"] },
  { id: "customer", label: "Customer (code or name)", anyOf: ["customer_code", "customer_name"] },
  { id: "item", label: "Item (code or name)", anyOf: ["item_code", "item_name", "roshen_item_code"] },
  { id: "value", label: "Sales value (excl. VAT or net)", anyOf: ["sales_value_excluding_vat", "net_value_after_discount"] },
  { id: "location", label: "Location/segment (channel, city, or branch)", anyOf: ["channel", "city", "branch_code", "branch_name"] },
  { id: "quantity", label: "Quantity (cartons or pieces)", anyOf: ["sales_qty_cartons", "sales_qty_pieces"] },
];

export const TIER_LABEL: Record<FieldTier, string> = {
  required: "Required",
  recommended: "Recommended",
  optional: "Optional",
};

/** Normalize a header for synonym matching. */
export function normHeader(h: string): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
