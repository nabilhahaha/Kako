import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";

const SAR = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) + " SAR";
const pct = (n: number | null) => (n == null ? "—" : `${n}%`);

const STATUS_STYLE: Record<string, string> = {
  Achieved: "bg-emerald-50 text-emerald-700",
  "On Track": "bg-sky-50 text-sky-700",
  "At Risk": "bg-amber-50 text-amber-700",
  Behind: "bg-roshen-red/10 text-roshen-red",
  Critical: "bg-roshen-red/15 text-roshen-red",
};

export default async function SlaReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const { data: months } = await supabase
    .from("sla_target")
    .select("period_month")
    .order("period_month", { ascending: false });
  const monthList = [...new Set((months ?? []).map((m) => String(m.period_month)))];
  const month = sp.month && monthList.includes(sp.month) ? sp.month : monthList[0] ?? null;

  let rows: Record<string, unknown>[] = [];
  const nameMaps: Record<string, Map<string, string>> = { region: new Map(), agent: new Map(), channel: new Map() };

  if (month) {
    const [perf, regions, agents, channels] = await Promise.all([
      supabase.from("sla_performance").select("*").eq("period_month", month),
      supabase.from("region").select("id,name"),
      supabase.from("agent").select("id,name"),
      supabase.from("channel").select("id,name"),
    ]);
    rows = (perf.data ?? []) as unknown as Record<string, unknown>[];
    (regions.data ?? []).forEach((r) => nameMaps.region.set(r.id, r.name));
    (agents.data ?? []).forEach((a) => a.name && nameMaps.agent.set(a.id, a.name));
    (channels.data ?? []).forEach((c) => nameMaps.channel.set(c.id, c.name));
  }

  const entityName = (level: string, id: string) => nameMaps[level]?.get(id) ?? id?.slice(0, 8) ?? "—";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">SLA Report</h1>
          <p className="text-sm text-muted">Sales target vs actual from imported data — achievement, gap, pace, and run-rate.</p>
        </div>
        {monthList.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {monthList.map((m) => (
              <Link
                key={m}
                href={`/sla-report?month=${m}`}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium " +
                  (m === month ? "bg-burgundy text-cream" : "border border-line text-muted hover:text-burgundy")
                }
              >
                {m.slice(0, 7)}
              </Link>
            ))}
          </div>
        )}
      </div>

      {!month ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-ink">No SLA targets yet</p>
          <p className="mt-1 text-sm text-muted">Add targets in SLA Targets, then import sales data to see performance here.</p>
          <Link href="/sla-targets" className="mt-4 inline-block rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream">Go to SLA Targets</Link>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-cream-deep/40 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2.5 font-semibold">Level</th>
                <th className="px-3 py-2.5 font-semibold">Entity</th>
                <th className="px-3 py-2.5 font-semibold">Channel</th>
                <th className="px-3 py-2.5 text-right font-semibold">Target</th>
                <th className="px-3 py-2.5 text-right font-semibold">Actual</th>
                <th className="px-3 py-2.5 text-right font-semibold">Ach %</th>
                <th className="px-3 py-2.5 text-right font-semibold">Gap</th>
                <th className="px-3 py-2.5 text-right font-semibold">Pace %</th>
                <th className="px-3 py-2.5 text-right font-semibold">Run-rate/day</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-muted">No targets for this month.</td></tr>
              ) : (
                rows.map((r, i) => {
                  const level = String(r.level);
                  const status = String(r.status ?? "");
                  return (
                    <tr key={i} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                      <td className="px-3 py-2.5 capitalize text-muted">{level === "agent" ? "Distributor" : level}</td>
                      <td className="px-3 py-2.5 font-medium text-ink">{entityName(level, String(r.ent_id))}</td>
                      <td className="px-3 py-2.5 text-muted">{r.channel_id ? entityName("channel", String(r.channel_id)) : "All"}</td>
                      <td className="px-3 py-2.5 text-right text-ink">{SAR(Number(r.target_amount ?? 0))}</td>
                      <td className="px-3 py-2.5 text-right text-ink">{SAR(Number(r.actual_amount ?? 0))}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-ink">{pct(r.achievement_pct as number | null)}</td>
                      <td className="px-3 py-2.5 text-right text-muted">{SAR(Number(r.gap_amount ?? 0))}</td>
                      <td className="px-3 py-2.5 text-right text-muted">{pct(r.pace_pct as number | null)}</td>
                      <td className="px-3 py-2.5 text-right text-muted">{SAR(r.required_run_rate as number | null)}</td>
                      <td className="px-3 py-2.5">
                        <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " + (STATUS_STYLE[status] ?? "bg-cream-deep text-muted")}>
                          {status || "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
