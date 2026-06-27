import { notFound, redirect } from "next/navigation";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { Stepper } from "@/components/app/import/stepper";
import { MappingEditor } from "@/components/app/import/mapping-editor";
import { suggestMapping } from "@/lib/import/mapping";
import { DEFAULT_POLICY, type CalcPolicy, type FieldMapping } from "@/lib/import/types";

export default async function MappingPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const { profile } = await requireProfile();
  if (!isAdminRole(profile!.role)) redirect("/import-batches");
  const supabase = await createClient();

  const { data: batch } = await supabase
    .from("import_batch")
    .select(
      "id,source_filename,detected_date_format,mapping_version_id,source_headers,sample_rows,column_count,agent:agent_id(name,code)",
    )
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) notFound();

  // ---- Mapping source resolution (identical for small & large files) ----
  // 1) batch.source_headers  2) keys of batch.sample_rows  3) raw_import_row keys
  let mappingSource = "saved headers";
  let headers: string[] = Array.isArray(batch.source_headers) ? (batch.source_headers as string[]) : [];
  let sampleRows: Record<string, unknown>[] = Array.isArray(batch.sample_rows)
    ? (batch.sample_rows as Record<string, unknown>[])
    : [];

  if (!headers.length && sampleRows.length) {
    mappingSource = "saved sample rows";
    const set = new Set<string>();
    for (const r of sampleRows) for (const k of Object.keys(r ?? {})) set.add(k);
    headers = [...set];
  }
  if (!headers.length) {
    // Fallback: read a few raw rows (small or legacy batches without saved headers)
    mappingSource = "raw rows fallback";
    const { data: rawRows } = await supabase
      .from("raw_import_row")
      .select("raw")
      .eq("batch_id", batchId)
      .order("row_number")
      .limit(5);
    sampleRows = (rawRows ?? []).map((r) => r.raw as Record<string, unknown>);
    const set = new Set<string>();
    for (const r of sampleRows) for (const k of Object.keys(r ?? {})) set.add(k);
    headers = [...set];
  }

  // Raw row count (debug only)
  const { count: rawCount } = await supabase
    .from("raw_import_row")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId);

  // Prefill from an existing mapping version (reuse/edit) if present.
  let initialChosen: Record<string, string> = {};
  let initialPolicy: CalcPolicy = DEFAULT_POLICY;
  let initialDateFormat = batch.detected_date_format ?? "auto";

  if (batch.mapping_version_id) {
    mappingSource = "saved mapping version";
    const { data: v } = await supabase
      .from("column_mapping_version")
      .select("field_mapping,sales_value_basis,vat_handling,vat_rate,discount_handling,returns_handling,sla_actual_basis")
      .eq("id", batch.mapping_version_id)
      .single();
    if (v) {
      const fm = v.field_mapping as unknown as FieldMapping;
      initialChosen = Object.fromEntries(Object.entries(fm).map(([k, e]) => [k, e.source]));
      if (fm.invoice_date?.format) initialDateFormat = fm.invoice_date.format;
      initialPolicy = {
        sales_value_basis: v.sales_value_basis,
        vat_handling: v.vat_handling,
        vat_rate: Number(v.vat_rate),
        discount_handling: v.discount_handling,
        returns_handling: v.returns_handling,
        sla_actual_basis: v.sla_actual_basis,
      };
    }
  }

  const suggestions = suggestMapping(headers);
  if (!Object.keys(initialChosen).length) {
    initialChosen = Object.fromEntries(
      suggestions.filter((s) => s.source && s.confidence >= 60).map((s) => [s.key, s.source as string]),
    );
  }

  const agent = (Array.isArray(batch.agent) ? batch.agent[0] : batch.agent) as { name?: string; code?: string } | null;
  const autoApplied = Object.keys(initialChosen).length;
  const suggestionCount = suggestions.filter((s) => s.source).length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">Mapping Preview</h1>
        <p className="text-sm text-muted">
          {agent?.name ? `${agent.name} · ` : ""}{batch.source_filename} · map source columns to canonical fields.
        </p>
      </div>
      <Stepper current="Mapping" />

      {/* Admin-only debug panel */}
      <details className="rounded-xl border border-line bg-cream/40 px-4 py-2 text-xs text-muted">
        <summary className="cursor-pointer font-medium">Mapping debug (admin)</summary>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          <span>Headers: <b className="text-ink">{headers.length}</b></span>
          <span>Sample rows: <b className="text-ink">{sampleRows.length}</b></span>
          <span>Raw rows: <b className="text-ink">{(rawCount ?? 0).toLocaleString()}</b></span>
          <span>Auto suggestions: <b className="text-ink">{suggestionCount}</b></span>
          <span>Auto applied: <b className="text-ink">{autoApplied}</b></span>
          <span>Mapping source: <b className="text-ink">{mappingSource}</b></span>
        </div>
      </details>

      <MappingEditor
        batchId={batchId}
        headers={headers}
        suggestions={suggestions}
        initialChosen={initialChosen}
        initialPolicy={initialPolicy}
        initialDateFormat={initialDateFormat}
        sampleRows={sampleRows}
      />
    </div>
  );
}
