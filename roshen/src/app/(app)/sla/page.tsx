import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";

type Level = "agent" | "city" | "area" | "region" | "country" | "company";
const LEVELS: { key: Level; label: string }[] = [
  { key: "agent", label: "Agent" },
  { key: "city", label: "City" },
  { key: "area", label: "Area" },
  { key: "region", label: "Region" },
  { key: "country", label: "Country" },
  { key: "company", label: "Company" },
];
const LEVEL_LABEL: Record<string, string> = Object.fromEntries(LEVELS.map((l) => [l.key, l.label]));

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtPeriod(v: unknown): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(v ?? ""));
  return m ? `${m[1]}-${m[2]}` : "—";
}
function money(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";
}
function pct(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? `${n}%` : "—";
}

const STATUS_STYLE: Record<string, string> = {
  Achieved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "On Track": "bg-sky-50 text-sky-700 border-sky-200",
  "At Risk": "bg-amber-50 text-amber-700 border-amber-200",
  Behind: "bg-orange-50 text-orange-700 border-orange-200",
  Critical: "bg-red-50 text-red-700 border-red-200",
};
function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted">—</span>;
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium " +
        (STATUS_STYLE[status] ?? "bg-cream-deep text-muted border-line")
      }
    >
      {status}
    </span>
  );
}

export default async function SlaReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; level?: string; channel?: string }>;
}) {
  const sp = await searchParams;
  const level = (LEVELS.find((l) => l.key === sp.level)?.key ?? "agent") as Level;
  const channel = (sp.channel ?? "").trim();

  await requireProfile();
  const supabase = await createClient();

  // Available periods (only months that have a scorecard row, i.e. a target set).
  const { data: periodRows } = await supabase
    .from("sla_scorecard")
    .select("period_month")
    .order("period_month", { ascending: false });
  const periods = Array.from(new Set((periodRows ?? []).map((r) => fmtPeriod(r.period_month)))).filter(
    (p) => p !== "—",
  );
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "")
    ? (sp.period as string)
    : periods[0] ?? currentPeriod();
  const periodDate = `${period}-01`;

  // Name lookups + channel list (single company → no extra filter needed).
  const [agents, regions, cities, areas, countries, company, channels] = await Promise.all([
    supabase.from("agent").select("id,name,code").order("name"),
    supabase.from("region").select("id,name").order("name"),
    supabase.from("city").select("id,name").order("name"),
    supabase.from("area").select("id,name").order("name"),
    supabase.from("country").select("id,name").order("name"),
    supabase.from("company").select("id,name").order("name"),
    supabase.from("channel").select("id,name").order("name"),
  ]);
  const nameByLevel: Record<string, Map<string, string>> = {
    agent: new Map((agents.data ?? []).map((r) => [r.id, r.code ? `${r.name} (${r.code})` : r.name])),
    region: new Map((regions.data ?? []).map((r) => [r.id, r.name])),
    city: new Map((cities.data ?? []).map((r) => [r.id, r.name])),
    area: new Map((areas.data ?? []).map((r) => [r.id, r.name])),
    country: new Map((countries.data ?? []).map((r) => [r.id, r.name])),
    company: new Map((company.data ?? []).map((r) => [r.id, r.name])),
  };
  const channelName = new Map((channels.data ?? []).map((r) => [r.id, r.name]));

  // Scorecard rows for the selection. Default view = the all-channels rollup.
  let query = supabase
    .from("sla_scorecard")
    .select("*")
    .eq("period_month", periodDate)
    .eq("level", level);
  query = channel ? query.eq("channel_id", channel) : query.is("channel_id", null);
  const { data: scRows } = await query;
  const rows = (scRows ?? []).slice().sort((a, b) => Number(b.sla_score ?? 0) - Number(a.sla_score ?? 0));

  // KPI roll-up across the visible rows.
  const count = rows.length;
  const avgScore = count ? Math.round(rows.reduce((s, r) => s + Number(r.sla_score ?? 0), 0) / count) : 0;
  const totalTarget = rows.reduce((s, r) => s + Number(r.sales_target ?? 0), 0);
  const totalActual = rows.reduce((s, r) => s + Number(r.actual_sales ?? 0), 0);
  const overallAch = totalTarget > 0 ? Math.round((100 * totalActual) / totalTarget) : null;
  const statusCounts: Record<string, number> = {};
  for (const r of rows) {
    const s = (r.sla_status as string) ?? "—";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }
  const statusOrder = ["Achieved", "On Track", "At Risk", "Behind", "Critical"];

  const qs = (over: Partial<{ period: string; level: string; channel: string }>) => {
    const p = new URLSearchParams({ period, level, channel, ...over });
    return `/app/sla?${p.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">SLA &amp; Coverage Scorecard</h1>
        <p className="text-sm text-muted">
          Sales achievement, coverage, salesforce and service combined into one monthly SLA score.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted">Level</span>
          <div className="inline-flex flex-wrap rounded-xl border border-line bg-white p-0.5">
            {LEVELS.map((l) => (
              <Link
                key={l.key}
                href={qs({ level: l.key })}
                className={
                  "rounded-lg px-3 py-1.5 text-sm font-medium " +
                  (l.key === level ? "bg-burgundy text-cream" : "text-muted hover:text-burgundy")
                }
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <form className="space-y-1" action="/app/sla" method="get">
          <input type="hidden" name="level" value={level} />
          <input type="hidden" name="channel" value={channel} />
          <label htmlFor="period" className="block text-xs font-medium uppercase tracking-wide text-muted">
            Period
          </label>
          <input
            id="period"
            name="period"
            type="month"
            defaultValue={period}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15"
          />
        </form>
        <form className="space-y-1" action="/app/sla" method="get">
          <input type="hidden" name="level" value={level} />
          <input type="hidden" name="period" value={period} />
          <label htmlFor="channel" className="block text-xs font-medium uppercase tracking-wide text-muted">
            Channel
          </label>
          <select
            id="channel"
            name="channel"
            defaultValue={channel}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15"
          >
            <option value="">All channels (rollup)</option>
            {(channels.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </form>
      </div>

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Avg SLA score</p>
          <p className="mt-1 font-serif text-3xl font-bold text-ink">{count ? avgScore : "—"}</p>
          <p className="mt-1 text-xs text-muted">{count} {LEVEL_LABEL[level].toLowerCase()} entr{count === 1 ? "y" : "ies"}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Sales achievement</p>
          <p className="mt-1 font-serif text-3xl font-bold text-ink">{overallAch != null ? `${overallAch}%` : "—"}</p>
          <p className="mt-1 text-xs text-muted">
            {money(totalActual)} / {money(totalTarget)} SAR
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Achieved / On Track</p>
          <p className="mt-1 font-serif text-3xl font-bold text-emerald-700">
            {(statusCounts["Achieved"] ?? 0) + (statusCounts["On Track"] ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted">of {count} entries</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">At Risk / Behind / Critical</p>
          <p className="mt-1 font-serif text-3xl font-bold text-orange-700">
            {(statusCounts["At Risk"] ?? 0) + (statusCounts["Behind"] ?? 0) + (statusCounts["Critical"] ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted">need attention</p>
        </div>
      </section>

      {/* Status distribution */}
      {count > 0 && (
        <div className="flex flex-wrap gap-2">
          {statusOrder
            .filter((s) => statusCounts[s])
            .map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-xs text-muted">
                <StatusBadge status={s} /> × {statusCounts[s]}
              </span>
            ))}
        </div>
      )}

      {/* Scorecard table */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-cream-deep/40 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-semibold">Entity</th>
              <th className="px-4 py-2.5 font-semibold">Channel</th>
              <th className="px-4 py-2.5 font-semibold">Sales (actual / target)</th>
              <th className="px-4 py-2.5 font-semibold">Ach %</th>
              <th className="px-4 py-2.5 font-semibold">Sales status</th>
              <th className="px-4 py-2.5 font-semibold">Coverage</th>
              <th className="px-4 py-2.5 font-semibold">Salesmen</th>
              <th className="px-4 py-2.5 font-semibold">Service</th>
              <th className="px-4 py-2.5 font-semibold">SLA score</th>
              <th className="px-4 py-2.5 font-semibold">SLA status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium text-ink">No scorecard data for {LEVEL_LABEL[level]} · {period}</p>
                  <p className="mt-1 text-xs text-muted">
                    Set {LEVEL_LABEL[level].toLowerCase()} sales targets in{" "}
                    <Link href={`/app/targets?tab=sales&level=${level}&period=${period}`} className="text-burgundy hover:underline">
                      SLA &amp; Coverage Setup
                    </Link>
                    , then import sales for this period.
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const name = nameByLevel[r.level as string]?.get(String(r.ent_id)) ?? "—";
                const services: string[] = [];
                if (r.warehouse_required) services.push(r.warehouse_available ? "WH✓" : "WH✗");
                if (r.cashvan_required) services.push(r.cashvan_available ? "CV✓" : "CV✗");
                if (r.supervisor_required) services.push(r.supervisor_available ? "SV✓" : "SV✗");
                return (
                  <tr key={`${r.ent_id}-${r.channel_id ?? "all"}`} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                    <td className="px-4 py-2.5 font-medium text-ink">{name}</td>
                    <td className="px-4 py-2.5 text-muted">{r.channel_id ? channelName.get(String(r.channel_id)) ?? "—" : "All"}</td>
                    <td className="px-4 py-2.5 text-ink">
                      {money(r.actual_sales)} <span className="text-muted">/ {money(r.sales_target)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{pct(r.sales_ach_pct)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={r.sales_status as string} /></td>
                    <td className="px-4 py-2.5 text-muted">
                      {r.active_customers != null ? (
                        <>
                          {r.active_customers}
                          {r.required_customer_universe ? ` / ${r.required_customer_universe}` : ""}
                          {r.actual_coverage_pct != null ? ` · ${r.actual_coverage_pct}%` : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {r.required_salesmen != null || r.actual_salesmen != null
                        ? `${r.actual_salesmen ?? 0} / ${r.required_salesmen ?? 0}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{services.length ? services.join(" ") : "—"}</td>
                    <td className="px-4 py-2.5 font-semibold text-ink">{r.sla_score ?? "—"}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={r.sla_status as string} /></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        SLA score = 40% sales achievement · 25% coverage · 15% active customers · 10% salesforce · 10% service
        readiness. Bands: ≥100 Achieved · ≥85 On Track · ≥70 At Risk · ≥50 Behind · &lt;50 Critical. Area Managers see
        only their assigned scope.
      </p>
    </div>
  );
}
