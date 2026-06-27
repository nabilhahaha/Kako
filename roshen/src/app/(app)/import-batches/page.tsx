import Link from "next/link";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { Upload } from "lucide-react";
import { STATUS_BADGE } from "@/components/app/import/status-badge";
import { MODE_LABEL } from "@/lib/import/modes";

export default async function ImportBatchesPage() {
  const { profile } = await requireProfile();
  const isAdmin = isAdminRole(profile!.role);
  const supabase = await createClient();

  const { data } = await supabase
    .from("import_batch")
    .select(
      "id,source_filename,period_start,period_end,period_month,status,import_mode,row_count,error_count,warning_count,created_at," +
        "agent:agent_id(name,code),version:mapping_version_id(version_number)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">Import Batches</h1>
          <p className="text-sm text-muted">Every upload is retained with its mapping version, mode, and audit trail.</p>
        </div>
        {isAdmin && (
          <Link href="/raw-data-upload" className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">
            <Upload className="h-4 w-4" /> New Upload
          </Link>
        )}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-cream-deep/40 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-semibold">File</th>
              <th className="px-4 py-2.5 font-semibold">Distributor</th>
              <th className="px-4 py-2.5 font-semibold">Period</th>
              <th className="px-4 py-2.5 font-semibold">Mode</th>
              <th className="px-4 py-2.5 font-semibold">Ver</th>
              <th className="px-4 py-2.5 font-semibold">Rows</th>
              <th className="px-4 py-2.5 font-semibold">Issues</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-muted">No imports yet.</td></tr>
            ) : (
              rows.map((r) => {
                const agent = rel(r.agent) as { name?: string; code?: string } | null;
                const ver = rel(r.version) as { version_number?: number } | null;
                const mode = r.import_mode as keyof typeof MODE_LABEL | null;
                return (
                  <tr key={String(r.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/import-batches/${r.id}`} className="font-medium text-burgundy hover:underline">
                        {String(r.source_filename ?? "—")}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{agent?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {r.period_start && r.period_end ? `${r.period_start} → ${r.period_end}` : String(r.period_month ?? "—")}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{mode ? MODE_LABEL[mode] : "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{ver?.version_number ? `v${ver.version_number}` : "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{Number(r.row_count ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {Number(r.error_count ?? 0) > 0 && <span className="text-roshen-red">{String(r.error_count)}e </span>}
                      {Number(r.warning_count ?? 0) > 0 && <span className="text-amber-600">{String(r.warning_count)}w</span>}
                      {Number(r.error_count ?? 0) === 0 && Number(r.warning_count ?? 0) === 0 && "—"}
                    </td>
                    <td className="px-4 py-2.5">{STATUS_BADGE(String(r.status))}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function rel(v: unknown) {
  return (Array.isArray(v) ? v[0] : v) as Record<string, unknown> | null;
}
