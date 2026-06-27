"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { validate } from "@/lib/import/validate";
import { computeMeasures, textValue } from "@/lib/import/calc";
import { normalizeDate, monthOf } from "@/lib/import/parse";
import { buildFieldMapping } from "@/lib/import/mapping";
import type { CalcPolicy, FieldMapping, ImportMode, RawRowPayload } from "@/lib/import/types";
import type { Json } from "@/lib/database.types";

async function ctx() {
  const { profile } = await requireProfile();
  if (!isAdminRole(profile?.role)) {
    throw new Error("Only an Admin can upload and import raw data.");
  }
  const supabase = await createClient();
  return { supabase, companyId: profile!.company_id!, userId: profile!.id };
}

async function insertChunked(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "raw_import_row" | "import_issue" | "sales_fact",
  rows: Record<string, unknown>[],
  size = 500,
) {
  for (let i = 0; i < rows.length; i += size) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from(table).insert(rows.slice(i, i + size) as any);
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
  }
}

// ----------------------------------------------------------------- Stage 1
// Large files (90k+ rows) cannot be sent in a single server-action request, so
// stage 1 is split: createDraftBatch persists METADATA only and returns the id;
// the client then streams rows via appendRawRows() in chunks with progress.
export type CreateDraftInput = {
  agentId: string;
  filename: string;
  sizeBytes: number;
  sheet: string;
  detectedDateFormat: string;
  period: { start: string | null; end: string | null; month: string | null };
  rowCount: number;
};

export async function createDraftBatch(input: CreateDraftInput): Promise<{ batchId: string }> {
  const { supabase, companyId, userId } = await ctx();
  const periodMonth =
    input.period.month ??
    (input.period.start ? monthOf(input.period.start) : new Date().toISOString().slice(0, 7) + "-01");

  const { data: batch, error } = await supabase
    .from("import_batch")
    .insert({
      company_id: companyId,
      agent_id: input.agentId,
      source_filename: input.filename,
      file_size_bytes: input.sizeBytes,
      period_month: periodMonth,
      period_start: input.period.start,
      period_end: input.period.end,
      detected_date_format: input.detectedDateFormat,
      row_count: input.rowCount,
      status: "pending",
      uploaded_by: userId,
      notes: `sheet: ${input.sheet}`,
    })
    .select("id")
    .single();
  if (error || !batch) throw new Error(error?.message ?? "Could not create import batch.");
  revalidatePath("/import-batches");
  return { batchId: batch.id };
}

/** Append one chunk of raw rows to a draft batch (called repeatedly by the client). */
export async function appendRawRows(batchId: string, rows: RawRowPayload[]): Promise<{ inserted: number }> {
  const { supabase } = await ctx();
  if (!rows.length) return { inserted: 0 };
  await insertChunked(
    supabase,
    "raw_import_row",
    rows.map((r) => ({
      batch_id: batchId,
      row_number: r.row_number,
      raw: r.raw as Json,
      raw_invoice_date: r.raw_invoice_date,
    })),
    500,
  );
  return { inserted: rows.length };
}

// ----------------------------------------------------------------- Stage 2
export type SaveMappingInput = {
  batchId: string;
  chosen: Record<string, string>;
  dateFormat: string;
  policy: CalcPolicy;
  headers: string[];
};

export async function saveMapping(input: SaveMappingInput) {
  const { supabase, companyId, userId } = await ctx();
  const { data: batch } = await supabase
    .from("import_batch")
    .select("id,agent_id")
    .eq("id", input.batchId)
    .single();
  if (!batch) throw new Error("Import batch not found.");

  const fieldMapping = buildFieldMapping(input.chosen, input.dateFormat);

  // find or create the agent's default mapping profile
  let { data: profile } = await supabase
    .from("column_mapping_profile")
    .select("id")
    .eq("agent_id", batch.agent_id)
    .eq("is_default", true)
    .maybeSingle();
  if (!profile) {
    const { data: created, error } = await supabase
      .from("column_mapping_profile")
      .insert({
        company_id: companyId,
        agent_id: batch.agent_id,
        name: "Default mapping",
        is_default: true,
        status: "active",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not create mapping profile.");
    profile = created;
  }

  // next version number
  const { data: last } = await supabase
    .from("column_mapping_version")
    .select("version_number")
    .eq("profile_id", profile.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const versionNumber = (last?.version_number ?? 0) + 1;

  const { data: version, error: vErr } = await supabase
    .from("column_mapping_version")
    .insert({
      company_id: companyId,
      agent_id: batch.agent_id,
      profile_id: profile.id,
      version_number: versionNumber,
      field_mapping: fieldMapping as Json,
      source_headers: input.headers as Json,
      status: "active",
      created_by: userId,
      sales_value_basis: input.policy.sales_value_basis,
      vat_handling: input.policy.vat_handling,
      vat_rate: input.policy.vat_rate,
      discount_handling: input.policy.discount_handling,
      returns_handling: input.policy.returns_handling,
      sla_actual_basis: input.policy.sla_actual_basis,
    })
    .select("id")
    .single();
  if (vErr || !version) throw new Error(vErr?.message ?? "Could not save mapping version.");

  await supabase
    .from("column_mapping_profile")
    .update({ current_version_id: version.id })
    .eq("id", profile.id);

  await supabase
    .from("import_batch")
    .update({
      mapping_version_id: version.id,
      resolved_field_mapping: fieldMapping as Json,
      detected_date_format: input.dateFormat,
      calculation_policy: input.policy as unknown as Json,
      status: "mapped",
    })
    .eq("id", input.batchId);

  revalidatePath(`/raw-data-upload/${input.batchId}/mapping`);
  redirect(`/raw-data-upload/${input.batchId}/validation`);
}

// ----------------------------------------------------------------- Stage 3
async function loadMappingContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: string,
) {
  const { data: batch } = await supabase
    .from("import_batch")
    .select("id,agent_id,company_id,mapping_version_id,detected_date_format,period_month,period_start,period_end")
    .eq("id", batchId)
    .single();
  if (!batch?.mapping_version_id) throw new Error("Batch has no saved mapping.");

  const { data: version } = await supabase
    .from("column_mapping_version")
    .select("field_mapping,sales_value_basis,vat_handling,vat_rate,discount_handling,returns_handling,sla_actual_basis")
    .eq("id", batch.mapping_version_id)
    .single();
  if (!version) throw new Error("Mapping version not found.");

  const fieldMapping = version.field_mapping as unknown as FieldMapping;
  const policy: CalcPolicy = {
    sales_value_basis: version.sales_value_basis,
    vat_handling: version.vat_handling,
    vat_rate: Number(version.vat_rate),
    discount_handling: version.discount_handling,
    returns_handling: version.returns_handling,
    sla_actual_basis: version.sla_actual_basis,
  };
  return { batch, fieldMapping, policy };
}

async function knownValueSets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  agentId: string,
) {
  const [channels, cities, vmaps] = await Promise.all([
    supabase.from("channel").select("name").eq("company_id", companyId),
    supabase.from("city").select("name").eq("company_id", companyId),
    supabase
      .from("value_mapping")
      .select("dimension,source_value,agent_id")
      .eq("company_id", companyId)
      .or(`agent_id.eq.${agentId},agent_id.is.null`),
  ]);
  const knownChannels = new Set<string>();
  const knownCities = new Set<string>();
  (channels.data ?? []).forEach((c) => c.name && knownChannels.add(c.name.toLowerCase()));
  (cities.data ?? []).forEach((c) => c.name && knownCities.add(c.name.toLowerCase()));
  (vmaps.data ?? []).forEach((v) => {
    if (v.dimension === "channel") knownChannels.add(v.source_value.toLowerCase());
    if (v.dimension === "city") knownCities.add(v.source_value.toLowerCase());
  });
  return { knownChannels, knownCities };
}

export async function runValidation(batchId: string) {
  const { supabase, companyId } = await ctx();
  const { batch, fieldMapping, policy } = await loadMappingContext(supabase, batchId);

  const { data: rawRows } = await supabase
    .from("raw_import_row")
    .select("row_number,raw")
    .eq("batch_id", batchId)
    .order("row_number");
  const rows = (rawRows ?? []).map((r) => ({ row_number: r.row_number, raw: r.raw as Record<string, unknown> }));

  const { knownChannels, knownCities } = await knownValueSets(supabase, companyId, batch.agent_id);

  const result = validate({
    rows,
    fieldMapping,
    policy,
    dateFormat: batch.detected_date_format ?? "auto",
    knownChannels,
    knownCities,
  });

  // refresh issues
  await supabase.from("import_issue").delete().eq("batch_id", batchId);
  if (result.issues.length) {
    await insertChunked(
      supabase,
      "import_issue",
      result.issues.map((i) => ({
        batch_id: batchId,
        code: i.code,
        severity: i.severity,
        field: i.field,
        row_number: i.row_number,
        message: i.message,
        raw_value: i.raw_value,
      })),
    );
  }

  await supabase
    .from("import_batch")
    .update({
      status: "validated",
      error_count: result.errorCount,
      warning_count: result.warningCount,
    })
    .eq("id", batchId);

  revalidatePath(`/raw-data-upload/${batchId}/validation`);
}

// ----------------------------------------------------------------- Stage 4
async function resolveOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agentId: string,
) {
  const { data: agent } = await supabase
    .from("agent")
    .select("id,city_id,branch_id,channel_id")
    .eq("id", agentId)
    .single();
  if (!agent) throw new Error("Distributor not found.");

  let region_id: string | null = null;
  let country_id: string | null = null;
  let area_id: string | null = null;
  const branch_id: string | null = agent.branch_id ?? null;

  if (agent.city_id) {
    const { data: city } = await supabase
      .from("city")
      .select("region_id, region:region_id(country_id)")
      .eq("id", agent.city_id)
      .single();
    region_id = city?.region_id ?? null;
    const reg = (Array.isArray(city?.region) ? city?.region[0] : city?.region) as { country_id?: string } | null;
    country_id = reg?.country_id ?? null;
  }
  if ((!region_id || !country_id) && branch_id) {
    const { data: branch } = await supabase
      .from("branch")
      .select("area_id, area:area_id(region_id, region:region_id(country_id))")
      .eq("id", branch_id)
      .single();
    area_id = branch?.area_id ?? null;
    const area = (Array.isArray(branch?.area) ? branch?.area[0] : branch?.area) as
      | { region_id?: string; region?: { country_id?: string } | { country_id?: string }[] }
      | null;
    region_id = region_id ?? area?.region_id ?? null;
    const reg = (Array.isArray(area?.region) ? area?.region[0] : area?.region) as { country_id?: string } | null;
    country_id = country_id ?? reg?.country_id ?? null;
  }
  if (!region_id || !country_id) {
    throw new Error("Distributor's city has no region/country set. Fix it in Organization before importing.");
  }
  return { region_id, country_id, area_id, branch_id, defaultChannel: agent.channel_id ?? null };
}

async function channelResolver(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  agentId: string,
) {
  const [channels, vmaps] = await Promise.all([
    supabase.from("channel").select("id,name").eq("company_id", companyId),
    supabase
      .from("value_mapping")
      .select("source_value,channel_id,dimension")
      .eq("company_id", companyId)
      .eq("dimension", "channel")
      .or(`agent_id.eq.${agentId},agent_id.is.null`),
  ]);
  const byName = new Map<string, string>();
  (channels.data ?? []).forEach((c) => c.name && byName.set(c.name.toLowerCase(), c.id));
  const bySource = new Map<string, string>();
  (vmaps.data ?? []).forEach((v) => v.channel_id && bySource.set(v.source_value.toLowerCase(), v.channel_id));
  return (sourceValue: string | null, fallback: string | null) => {
    if (!sourceValue) return fallback;
    const k = sourceValue.toLowerCase();
    return bySource.get(k) ?? byName.get(k) ?? fallback;
  };
}

function mapInvoiceStatus(v: string | null): "posted" | "cancelled" | "draft" | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("draft")) return "draft";
  return "posted";
}

export async function commitImport(batchId: string, mode: ImportMode) {
  const { supabase, companyId, userId } = await ctx();
  const { batch, fieldMapping, policy } = await loadMappingContext(supabase, batchId);

  const org = await resolveOrg(supabase, batch.agent_id);
  const resolveChannel = await channelResolver(supabase, companyId, batch.agent_id);

  // --- Supersede per import mode (audit kept; views read 'imported' only) ---
  if (mode === "full_period_replace" || mode === "correction_reprocess") {
    await supabase
      .from("import_batch")
      .update({ status: "superseded" })
      .eq("agent_id", batch.agent_id)
      .eq("period_month", batch.period_month)
      .eq("status", "imported")
      .neq("id", batchId);
  } else if (mode === "replace_overlapping" && batch.period_start && batch.period_end) {
    const { data: existing } = await supabase
      .from("import_batch")
      .select("id,period_start,period_end")
      .eq("agent_id", batch.agent_id)
      .eq("status", "imported")
      .neq("id", batchId);
    const overlapIds = (existing ?? [])
      .filter((e) => e.period_start && e.period_end && e.period_start <= batch.period_end! && batch.period_start! <= e.period_end)
      .map((e) => e.id);
    if (overlapIds.length) {
      await supabase.from("import_batch").update({ status: "superseded" }).in("id", overlapIds);
    }
  }

  // --- Incremental dedupe: skip lines already present in active imports ---
  let existingHashes = new Set<string>();
  if (mode === "incremental_append") {
    const { data: prior } = await supabase
      .from("sales_fact")
      .select("line_hash, import_batch!inner(status)")
      .eq("agent_id", batch.agent_id)
      .eq("import_batch.status", "imported");
    existingHashes = new Set((prior ?? []).map((r) => r.line_hash).filter(Boolean) as string[]);
  }

  // --- Build sales_fact rows from valid raw rows ---
  const { data: rawRows } = await supabase
    .from("raw_import_row")
    .select("row_number,raw")
    .eq("batch_id", batchId)
    .order("row_number");

  const factRows: Record<string, unknown>[] = [];
  let excluded = 0;
  let skippedDup = 0;
  for (const rr of rawRows ?? []) {
    const raw = rr.raw as Record<string, unknown>;
    const dv = textValue(raw, fieldMapping, "invoice_date");
    const dp = normalizeDate(dv, batch.detected_date_format ?? "auto");
    if (!dp.iso) {
      excluded++;
      continue;
    }
    const m = computeMeasures(raw, fieldMapping, policy);
    const channelSrc = textValue(raw, fieldMapping, "channel");
    const channel_id = resolveChannel(channelSrc, org.defaultChannel);
    const invoice_number = textValue(raw, fieldMapping, "invoice_number");
    const customer_code = textValue(raw, fieldMapping, "customer_code");
    const item_code = textValue(raw, fieldMapping, "item_code");
    const lineHash = [batch.agent_id, invoice_number, dp.iso, customer_code, item_code].join("|");

    if (mode === "incremental_append" && existingHashes.has(lineHash)) {
      skippedDup++;
      continue;
    }

    factRows.push({
      company_id: companyId,
      batch_id: batchId,
      agent_id: batch.agent_id,
      branch_id: org.branch_id,
      area_id: org.area_id,
      region_id: org.region_id,
      country_id: org.country_id,
      channel_id,
      invoice_number,
      customer_code,
      customer_name: textValue(raw, fieldMapping, "customer_name"),
      item_code,
      item_name: textValue(raw, fieldMapping, "item_name"),
      roshen_item_code: textValue(raw, fieldMapping, "roshen_item_code"),
      salesman_name: textValue(raw, fieldMapping, "salesman_name"),
      route_number: textValue(raw, fieldMapping, "route_number"),
      return_reason: textValue(raw, fieldMapping, "return_reason"),
      invoice_date: dp.iso,
      period_month: monthOf(dp.iso),
      invoice_status: mapInvoiceStatus(textValue(raw, fieldMapping, "invoice_status")),
      source_sales_value: m.source_sales_value,
      sales_value_excl_vat: m.sales_value_excl_vat,
      gross_value: m.gross_value,
      net_value_reported: m.net_value_reported,
      vat_amount: m.vat_amount,
      returns_value: m.returns_value,
      cash_discount: m.cash_discount,
      gross_sales_ex_vat: m.gross_sales_ex_vat,
      net_sales_ex_vat: m.net_sales_ex_vat,
      sla_actual_value: m.sla_actual_value,
      calculation_policy_used: policy as unknown as Json,
      sales_qty_cartons: numOrZero(raw, fieldMapping, "sales_qty_cartons"),
      sales_qty_pieces: numOrZero(raw, fieldMapping, "sales_qty_pieces"),
      line_hash: lineHash,
    });
  }

  if (factRows.length) await insertChunked(supabase, "sales_fact", factRows);

  await supabase
    .from("import_batch")
    .update({
      status: "imported",
      import_mode: mode,
      confirmed_by: userId,
      imported_at: new Date().toISOString(),
      calculation_policy: policy as unknown as Json,
      notes: `${batch_note(mode)} — ${factRows.length} rows imported, ${excluded} excluded${
        skippedDup ? `, ${skippedDup} duplicates skipped` : ""
      }.`,
    })
    .eq("id", batchId);

  revalidatePath("/import-batches");
  revalidatePath("/sla-report");
  redirect(`/import-batches/${batchId}`);
}

function batch_note(mode: ImportMode) {
  return `Imported via ${mode}`;
}

function numOrZero(raw: Record<string, unknown>, fm: FieldMapping, key: string): number {
  const e = fm[key];
  if (!e) return 0;
  const v = raw[e.source];
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
}

// ----------------------------------------------------------------- cancel
export async function cancelBatch(batchId: string) {
  const { supabase } = await ctx();
  await supabase.from("import_batch").update({ status: "cancelled" }).eq("id", batchId);
  revalidatePath("/import-batches");
  redirect("/import-batches");
}
