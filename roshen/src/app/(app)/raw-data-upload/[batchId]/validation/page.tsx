import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, AlertCircle, Info, ArrowRight, PlayCircle } from "lucide-react";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { Stepper } from "@/components/app/import/stepper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { runValidation } from "@/lib/import/actions";
import { computeMeasures } from "@/lib/import/calc";
import { describePolicy } from "@/lib/import/calc";
import { normalizeDate } from "@/lib/import/parse";
import { DEFAULT_POLICY, type CalcPolicy, type FieldMapping } from "@/lib/import/types";

const SAR = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) + " SAR";

export default async function ValidationPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const { profile } = await requireProfile();
  if (!isAdminRole(profile!.role)) redirect("/import-batches");
  const supabase = await createClient();

  const { data: batch } = await supabase
    .from("import_batch")
    .select("id,status,error_count,warning_count,row_count,detected_date_format,mapping_version_id,source_filename")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) notFound();
  if (!batch.mapping_version_id) redirect(`/raw-data-upload/${batchId}/mapping`);

  const { data: version } = await supabase
    .from("column_mapping_version")
    .select("field_mapping,sales_value_basis,vat_handling,vat_rate,discount_handling,returns_handling,sla_actual_basis")
    .eq("id", batch.mapping_version_id)
    .single();
  const fm = (version?.field_mapping as unknown as FieldMapping) ?? {};
  const policy: CalcPolicy = version
    ? {
        sales_value_basis: version.sales_value_basis,
        vat_handling: version.vat_handling,
        vat_rate: Number(version.vat_rate),
        discount_handling: version.discount_handling,
        returns_handling: version.returns_handling,
        sla_actual_basis: version.sla_actual_basis,
      }
    : DEFAULT_POLICY;

  const { data: issues } = await supabase
    .from("import_issue")
    .select("code,severity,field,row_number,message,raw_value")
    .eq("batch_id", batchId)
    .order("severity");

  const errors = (issues ?? []).filter((i) => i.severity === "error");
  const warnings = (issues ?? []).filter((i) => i.severity === "warning");
  const infos = (issues ?? []).filter((i) => i.severity === "info");

  // Sample computed SLA on first rows
  const { data: sampleRaw } = await supabase
    .from("raw_import_row")
    .select("row_number,raw")
    .eq("batch_id", batchId)
    .order("row_number")
    .limit(5);
  const sample = (sampleRaw ?? []).map((r) => {
    const raw = r.raw as Record<string, unknown>;
    const m = computeMeasures(raw, fm, policy);
    const d = normalizeDate(raw[fm.invoice_date?.source ?? ""], batch.detected_date_format ?? "auto");
    return { row: r.row_number, date: d.iso, exVat: m.sales_value_excl_vat, net: m.net_sales_ex_vat, sla: m.sla_actual_value };
  });

  const hasRun = batch.status === "validated" || batch.status === "imported";
  const canContinue = hasRun && batch.error_count === 0;

  async function doValidate() {
    "use server";
    await runValidation(batchId);
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">Validation Preview</h1>
        <p className="text-sm text-muted">{batch.source_filename} · {describePolicy(policy)}</p>
      </div>
      <Stepper current="Validation" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rows" value={batch.row_count.toLocaleString()} />
        <Stat label="Errors" value={String(batch.error_count)} tone={batch.error_count ? "bad" : "good"} />
        <Stat label="Warnings" value={String(batch.warning_count)} tone={batch.warning_count ? "warn" : "good"} />
        <Stat label="Status" value={batch.status} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={doValidate}>
          <Button type="submit" variant="outline">
            <PlayCircle className="h-4 w-4" /> {hasRun ? "Re-run validation" : "Run validation"}
          </Button>
        </form>
        <Link
          href={`/raw-data-upload/${batchId}/decision`}
          className={
            "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium " +
            (canContinue ? "bg-burgundy text-cream hover:bg-burgundy-hover" : "pointer-events-none bg-cream-deep text-muted")
          }
        >
          Continue to decision <ArrowRight className="h-4 w-4" />
        </Link>
        {!hasRun && <span className="text-xs text-muted">Run validation to check the file before importing.</span>}
        {hasRun && batch.error_count > 0 && (
          <span className="text-xs text-roshen-red">Resolve blocking errors before continuing.</span>
        )}
      </div>

      {sample.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-line bg-cream-deep/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Sample computed SLA actual (first {sample.length} rows)
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2">Row</th><th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Ex-VAT</th><th className="px-4 py-2">Net ex-VAT</th><th className="px-4 py-2">SLA actual</th>
              </tr>
            </thead>
            <tbody>
              {sample.map((s) => (
                <tr key={s.row} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-1.5 text-muted">{s.row}</td>
                  <td className="px-4 py-1.5">{s.date ?? "—"}</td>
                  <td className="px-4 py-1.5">{SAR(s.exVat)}</td>
                  <td className="px-4 py-1.5">{SAR(s.net)}</td>
                  <td className="px-4 py-1.5 font-medium text-ink">{SAR(s.sla)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <IssueGroup title="Errors (block import)" icon={<AlertCircle className="h-4 w-4 text-roshen-red" />} items={errors} />
      <IssueGroup title="Warnings" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} items={warnings} />
      <IssueGroup title="Notes" icon={<Info className="h-4 w-4 text-muted" />} items={infos} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const c = tone === "bad" ? "text-roshen-red" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-700" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className={"mt-0.5 text-sm font-semibold capitalize " + c}>{value}</p>
    </div>
  );
}

function IssueGroup({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: { code: string; field: string | null; row_number: number | null; message: string; raw_value: string | null }[];
}) {
  if (items.length === 0) return null;
  const shown = items.slice(0, 25);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-cream-deep/30 px-4 py-2 text-sm font-medium text-ink">
        {icon} {title} <span className="text-xs text-muted">({items.length})</span>
      </div>
      <ul className="divide-y divide-line/60 text-sm">
        {shown.map((i, idx) => (
          <li key={idx} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2">
            <span className="rounded bg-cream-deep px-1.5 py-0.5 text-[11px] font-medium text-muted">{i.code}</span>
            {i.row_number != null && <span className="text-xs text-muted">row {i.row_number}</span>}
            <span className="text-ink/85">{i.message}</span>
          </li>
        ))}
        {items.length > shown.length && (
          <li className="px-4 py-2 text-xs text-muted">+{items.length - shown.length} more…</li>
        )}
      </ul>
    </Card>
  );
}
