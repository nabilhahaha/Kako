import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { Stepper } from "@/components/app/import/stepper";
import { Card } from "@/components/ui/card";
import { DecisionForm } from "@/components/app/import/decision-form";
import { recommendMode, type ExistingCoverage } from "@/lib/import/modes";

export default async function DecisionPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const { profile } = await requireProfile();
  if (!isAdminRole(profile!.role)) redirect("/import-batches");
  const supabase = await createClient();

  const { data: batch } = await supabase
    .from("import_batch")
    .select("id,status,error_count,agent_id,period_start,period_end,period_month,row_count,source_filename,agent:agent_id(name)")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) notFound();
  if (!["previewed", "validated", "mapped", "imported"].includes(batch.status)) redirect(`/raw-data-upload/${batchId}/validation`);

  if (batch.status === "imported") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <Stepper current="Imported" />
        <Card className="p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-2 font-serif text-xl font-bold text-ink">Batch already imported</h1>
          <Link href={`/import-batches/${batchId}`} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream">
            View batch <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </div>
    );
  }

  const { data: existingRaw } = await supabase
    .from("import_batch")
    .select("id,period_start,period_end,period_month,row_count,status")
    .eq("agent_id", batch.agent_id)
    .eq("status", "imported")
    .neq("id", batchId);
  const existing: ExistingCoverage[] = (existingRaw ?? []).map((e) => ({
    batch_id: e.id,
    period_start: e.period_start,
    period_end: e.period_end,
    period_month: e.period_month,
    row_count: e.row_count,
    status: e.status,
  }));

  const rec = recommendMode({
    newStart: batch.period_start,
    newEnd: batch.period_end,
    newMonth: batch.period_month,
    existing,
  });
  const agent = (Array.isArray(batch.agent) ? batch.agent[0] : batch.agent) as { name?: string } | null;
  const blocked = (batch.error_count ?? 0) > 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">Import Decision</h1>
        <p className="text-sm text-muted">
          {agent?.name ? `${agent.name} · ` : ""}{batch.row_count.toLocaleString()} rows ·{" "}
          {batch.period_start && batch.period_end ? `${batch.period_start} → ${batch.period_end}` : batch.period_month}
        </p>
      </div>
      <Stepper current="Decision" />

      <Card className="p-4">
        <p className="text-sm font-medium text-ink">Existing imported coverage for this distributor</p>
        {existing.length === 0 ? (
          <p className="mt-1 text-sm text-muted">None — this is the first import for this distributor.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-ink/80">
            {existing.map((e) => (
              <li key={e.batch_id} className="flex justify-between border-b border-line/50 py-1 last:border-0">
                <span>{e.period_start && e.period_end ? `${e.period_start} → ${e.period_end}` : e.period_month}</span>
                <span className="text-muted">{e.row_count.toLocaleString()} rows</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <DecisionForm batchId={batchId} recommended={rec.mode} reason={rec.reason} blocked={blocked} rowCount={batch.row_count} />
    </div>
  );
}
