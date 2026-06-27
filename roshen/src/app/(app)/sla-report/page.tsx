import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";

const SAR = (n: number | null) => (n == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) + " SAR");
const pct = (n: unknown) => (n == null ? "—" : `${n}%`);
const yn = (b: unknown) => (b == null ? "—" : b ? "Yes" : "No");

const STATUS_STYLE: Record<string, string> = {
  Achieved: "bg-emerald-50 text-emerald-700",
  "On Track": "bg-sky-50 text-sky-700",
  "At Risk": "bg-amber-50 text-amber-700",
  Behind: "bg-roshen-red/10 text-roshen-red",
  Critical: "bg-roshen-red/20 text-roshen-red",
};

export default async function SlaReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const { data: months } = await supabase.from("sla_target").select("period_month").order("period_month", { ascending: false });
  const monthList = [...new Set((months ?? []).map((m) => String(m.period_month)))];
  const month = sp.month && monthList.includes(sp.month) ? sp.month : monthList[0] ?? null;

  let rows: Record<string, unknown>[] = [];
  const maps: Record<string, Map<string, string>> = { region: new Map(), agent: new Map(), city: new Map(), channel: new Map() };

  if (month) {
    const [sc, regions, agents, cities, channels] = await Promise.all([
      supabase.from("sla_scorecard").select("*").eq("period_month", month),
      supabase.from("region").select("id,name"),
      supabase.from("agent").select("id,name"),
      supabase.from("city").select("id,name"),
      supabase.from("channel").select("id,name"),
    ]);
    rows = (sc.data ?? []) as unknown as Record<string, unknown>[];
    (regions.data ?? []).forEach((r) => maps.region.set(r.id, r.name));
    (agents.data ?? []).forEach((a) => a.name && maps.agent.set(a.id, a.name));
    (cities.data ?? []).forEach((c) => maps.city.set(c.id, c.name));
    (channels.data ?? []).forEach((c) => maps.channel.set(c.id, c.name));
  }
  const nameOf = (level: string, id: string) => maps[level]?.get(id) ?? (id ? id.slice(0, 8) : "—");

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">SLA Report</h1>
          <p className="text-sm text-muted">Combined scorecard — sales, customer coverage, sales-force capacity, and service capability.</p>
        </div>
        {monthList.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {monthList.map((m) => (
              <Link key={m} href={`/sla-report?month=${m}`}
                className={"rounded-full px-3 py-1 text-xs font-medium " + (m === month ? "bg-burgundy text-cream" : "border border-line text-muted hover:text-burgundy")}>
                {m.slice(0, 7)}
              </Link>
            ))}
          </div>
        )}
      </div>

      {!month ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-ink">No SLA targets yet</p>
          <p className="mt-1 text-sm text-muted">Add Sales Targets (and optionally Coverage/Capability) in SLA &amp; Coverage Setup, then import data.</p>
          <Link href="/sla-targets" className="mt-4 inline-block rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream">Go to SLA &amp; Coverage Setup</Link>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line bg-cream-deep/40 text-left uppercase tracking-wide text-muted">
                {["Level","Entity","Channel","Sales Target","Actual Sales","Sales %","Req. Cust","Uploaded","Active","Coverage %","Req. SM","Act. SM","SM Gap","WH Req","WH Avail","Score","Status"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={17} className="px-4 py-12 text-center text-sm text-muted">No targets for this month.</td></tr>
              ) : (
                rows.map((r, i) => {
                  const level = String(r.level);
                  const status = String(r.sla_status ?? "");
                  return (
                    <tr key={i} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                      <td className="px-3 py-2 capitalize text-muted">{level === "agent" ? "Distributor" : level}</td>
                      <td className="px-3 py-2 font-medium text-ink">{nameOf(level, String(r.ent_id))}</td>
                      <td className="px-3 py-2 text-muted">{r.channel_id ? nameOf("channel", String(r.channel_id)) : "All"}</td>
                      <td className="px-3 py-2 text-ink/80">{SAR(Number(r.sales_target ?? 0))}</td>
                      <td className="px-3 py-2 text-ink/80">{SAR(Number(r.actual_sales ?? 0))}</td>
                      <td className="px-3 py-2 font-medium text-ink">{pct(r.sales_ach_pct)}</td>
                      <td className="px-3 py-2 text-muted">{String(r.required_customer_universe ?? "—")}</td>
                      <td className="px-3 py-2 text-muted">{String(r.uploaded_customers ?? "—")}</td>
                      <td className="px-3 py-2 text-muted">{String(r.active_customers ?? "—")}</td>
                      <td className="px-3 py-2 text-muted">{pct(r.actual_coverage_pct)}</td>
                      <td className="px-3 py-2 text-muted">{String(r.required_salesmen ?? "—")}</td>
                      <td className="px-3 py-2 text-muted">{String(r.actual_salesmen ?? "—")}</td>
                      <td className="px-3 py-2 text-muted">{String(r.salesmen_gap ?? "—")}</td>
                      <td className="px-3 py-2 text-muted">{yn(r.warehouse_required)}</td>
                      <td className="px-3 py-2 text-muted">{yn(r.warehouse_available)}</td>
                      <td className="px-3 py-2 font-semibold text-ink">{r.sla_score != null ? String(r.sla_score) : "—"}</td>
                      <td className="px-3 py-2"><span className={"inline-flex items-center rounded-full px-2 py-0.5 font-medium " + (STATUS_STYLE[status] ?? "bg-cream-deep text-muted")}>{status || "—"}</span></td>
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
