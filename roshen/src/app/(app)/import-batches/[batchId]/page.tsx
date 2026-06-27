import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileSpreadsheet } from "lucide-react";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { STATUS_BADGE } from "@/components/app/import/status-badge";
import { MODE_LABEL } from "@/lib/import/modes";
import type { FieldMapping } from "@/lib/import/types";

const SAR = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) + " SAR";

const NEXT_STEP: Record<string, string> = {
  pending: "mapping",
  mapped: "validation",
  previewed: "decision",
  validated: "decision",
};

export default async function BatchDetail({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const { profile } = await requireProfile();
  const isAdmin = isAdminRole(profile!.role);
  const supabase = await createClient();

  const { data: bRaw } = await supabase
    .from("import_batch")
    .select(
      "id,source_filename,file_size_bytes,period_start,period_end,period_month,status,import_mode,row_count,error_count,warning_count,created_at,imported_at,notes,detected_date_format,calculation_policy,resolved_field_mapping," +
        "agent:agent_id(name,code),version:mapping_version_id(version_number)," +
        "uploader:uploaded_by(full_name,email),confirmer:confirmed_by(full_name,email)",
    )
    .eq("id", batchId)
    .maybeSingle();
  if (!bRaw) notFound();
  const b = bRaw as unknown as Record<string, unknown>;

  const agent = rel(b.agent) as { name?: string; code?: string } | null;
  const ver = rel(b.version) as { version_number?: number } | null;
  const uploader = rel(b.uploader) as { full_name?: string; email?: string } | null;
  const confirmer = rel(b.confirmer) as { full_name?: string; email?: string } | null;
  const fm = (b.resolved_field_mapping as unknown as FieldMapping) ?? {};
  const mode = b.import_mode as keyof typeof MODE_LABEL | null;

  // imported total for this batch — aggregated in Postgres (one row), not by
  // loading every sales_fact row into the app.
  const { data: totals } = await supabase
    .from("import_batch_totals")
    .select("fact_rows,sla_total")
    .eq("batch_id", batchId)
    .maybeSingle();
  const factCount = Number(totals?.fact_rows ?? 0);
  const slaTotal = Number(totals?.sla_total ?? 0);

  const status = String(b.status);
  const nextStep = isAdmin ? NEXT_STEP[status] : undefined;
  const periodLabel =
    b.period_start && b.period_end ? `${String(b.period_start)} → ${String(b.period_end)}` : String(b.period_month ?? "—");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl font-bold tracking-tight text-ink">
            <FileSpreadsheet className="h-5 w-5 text-burgundy" /> {String(b.source_filename ?? "—")}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {agent?.name ?? "—"} · {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {STATUS_BADGE(status)}
          {nextStep && (
            <Link href={`/raw-data-upload/${batchId}/${nextStep}`} className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy px-3 py-1.5 text-sm font-medium text-cream hover:bg-burgundy-hover">
              Continue <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rows" value={Number(b.row_count ?? 0).toLocaleString()} />
        <Stat label="Imported rows" value={factCount.toLocaleString()} />
        <Stat label="SLA actual total" value={SAR(slaTotal)} />
        <Stat label="Mode" value={mode ? MODE_LABEL[mode] : "—"} />
      </div>

      <Card className="p-5">
        <h2 className="font-serif text-lg font-semibold text-ink">Audit</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row k="Mapping version" v={ver?.version_number ? `v${ver.version_number}` : "—"} />
          <Row k="Date format" v={String(b.detected_date_format ?? "—")} />
          <Row k="Errors / Warnings" v={`${b.error_count} / ${b.warning_count}`} />
          <Row k="File size" v={b.file_size_bytes ? `${Math.round(Number(b.file_size_bytes) / 1024)} KB` : "—"} />
          <Row k="Uploaded by" v={uploader?.full_name || uploader?.email || "—"} />
          <Row k="Confirmed by" v={confirmer?.full_name || confirmer?.email || "—"} />
          <Row k="Created" v={fmtDate(b.created_at)} />
          <Row k="Imported" v={fmtDate(b.imported_at)} />
        </dl>
        {b.notes ? <p className="mt-3 rounded-lg bg-cream/50 px-3 py-2 text-xs text-muted">{String(b.notes)}</p> : null}
      </Card>

      <Card className="p-5">
        <h2 className="font-serif text-lg font-semibold text-ink">Resolved field mapping</h2>
        <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          {Object.keys(fm).length === 0 ? (
            <p className="text-muted">No mapping saved yet.</p>
          ) : (
            Object.entries(fm).map(([k, e]) => (
              <div key={k} className="flex justify-between border-b border-line/40 py-1">
                <span className="text-ink/80">{k}</span>
                <span className="text-muted">{e.source}{e.format ? ` (${e.format})` : ""}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function rel(v: unknown) {
  return (Array.isArray(v) ? v[0] : v) as Record<string, unknown> | null;
}
function fmtDate(v: unknown) {
  if (!v) return "—";
  return new Date(String(v)).toISOString().slice(0, 16).replace("T", " ");
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-line/40 py-1">
      <dt className="text-muted">{k}</dt>
      <dd className="font-medium text-ink">{v}</dd>
    </div>
  );
}
