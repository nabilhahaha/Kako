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
    .select("id,source_filename,detected_date_format,mapping_version_id,agent:agent_id(name,code)")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) notFound();

  const { data: rawRows } = await supabase
    .from("raw_import_row")
    .select("raw")
    .eq("batch_id", batchId)
    .order("row_number")
    .limit(5);
  const sampleRows = (rawRows ?? []).map((r) => r.raw as Record<string, unknown>);
  // Union of keys across sampled rows (robust to a sparse first row).
  const headerSet = new Set<string>();
  for (const row of sampleRows) for (const k of Object.keys(row ?? {})) headerSet.add(k);
  const headers = [...headerSet];

  // Prefill from an existing mapping version (reuse/edit) if present.
  let initialChosen: Record<string, string> = {};
  let initialPolicy: CalcPolicy = DEFAULT_POLICY;
  let initialDateFormat = batch.detected_date_format ?? "auto";

  if (batch.mapping_version_id) {
    const { data: v } = await supabase
      .from("column_mapping_version")
      .select("field_mapping,sales_value_basis,vat_handling,vat_rate,discount_handling,returns_handling,sla_actual_basis")
      .eq("id", batch.mapping_version_id)
      .single();
    if (v) {
      const fm = v.field_mapping as unknown as FieldMapping;
      initialChosen = Object.fromEntries(Object.entries(fm).map(([k, e]) => [k, e.source]));
      const dateEntry = fm.invoice_date;
      if (dateEntry?.format) initialDateFormat = dateEntry.format;
      initialPolicy = {
        sales_value_basis: v.sales_value_basis,
        vat_handling: v.vat_handling,
        vat_rate: Number(v.vat_rate),
        discount_handling: v.discount_handling,
        returns_handling: v.returns_handling,
        sla_actual_basis: v.sla_actual_basis,
      };
    }
  } else {
    // Auto-map on first upload.
    const sugg = suggestMapping(headers);
    initialChosen = Object.fromEntries(
      sugg.filter((s) => s.source && s.confidence >= 60).map((s) => [s.key, s.source as string]),
    );
  }

  const suggestions = suggestMapping(headers);
  const agent = (Array.isArray(batch.agent) ? batch.agent[0] : batch.agent) as { name?: string; code?: string } | null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">Mapping Preview</h1>
        <p className="text-sm text-muted">
          {agent?.name ? `${agent.name} · ` : ""}{batch.source_filename} · map source columns to canonical fields.
        </p>
      </div>
      <Stepper current="Mapping" />
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
