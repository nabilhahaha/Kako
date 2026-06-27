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
const STATUS_ORDER = ["Achieved", "On Track", "At Risk", "Behind", "Critical"];

// UI level -> sla_scorecard.level value
const LEVEL_DB: Record<string, string> = { region: "region", city: "city", distributor: "agent" };

type SP = {
  month?: string;
  level?: string;
  region?: string;
  city?: string;
  distributor?: string;
  channel?: string;
  status?: string;
  score_min?: string;
  score_max?: string;
};

const selectCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15";

export default async function SlaReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const { data: months } = await supabase
    .from("sla_target")
    .select("period_month")
    .order("period_month", { ascending: false });
  const monthList = [...new Set((months ?? []).map((m) => String(m.period_month)))];
  const month = sp.month && monthList.includes(sp.month) ? sp.month : monthList[0] ?? null;

  // Filter selections
  const level = ["region", "city", "distributor"].includes(sp.level ?? "") ? (sp.level as string) : "all";
  const regionF = (sp.region ?? "").trim();
  const cityF = (sp.city ?? "").trim();
  const distributorF = (sp.distributor ?? "").trim();
  const channel = (sp.channel ?? "").trim(); // "" rollup (null) | "__all__" every row | <id>
  const statusF = STATUS_ORDER.includes(sp.status ?? "") ? (sp.status as string) : "";
  const scoreMin = sp.score_min && /^\d+$/.test(sp.score_min) ? Number(sp.score_min) : null;
  const scoreMax = sp.score_max && /^\d+$/.test(sp.score_max) ? Number(sp.score_max) : null;

  let rows: Record<string, unknown>[] = [];
  const maps: Record<string, Map<string, string>> = { region: new Map(), agent: new Map(), city: new Map(), channel: new Map() };
  const cityRegion = new Map<string, string>(); // city_id -> region_id
  const agentCity = new Map<string, string>(); // agent_id -> city_id
  let regionOpts: { id: string; name: string }[] = [];
  let cityOpts: { id: string; name: string }[] = [];
  let distributorOpts: { id: string; name: string }[] = [];
  let channelOpts: { id: string; name: string }[] = [];

  if (month) {
    // Scorecard query — push level / channel / status / score filters into SQL.
    let scq = supabase.from("sla_scorecard").select("*").eq("period_month", month);
    if (level !== "all") scq = scq.eq("level", LEVEL_DB[level] as "region" | "city" | "agent");
    if (channel === "") scq = scq.is("channel_id", null);
    else if (channel !== "__all__") scq = scq.eq("channel_id", channel);
    if (statusF) scq = scq.eq("sla_status", statusF);
    if (scoreMin != null) scq = scq.gte("sla_score", scoreMin);
    if (scoreMax != null) scq = scq.lte("sla_score", scoreMax);

    const [sc, regions, agents, cities, channels] = await Promise.all([
      scq,
      supabase.from("region").select("id,name").order("name"),
      supabase.from("agent").select("id,name,code,city_id,type").order("name"),
      supabase.from("city").select("id,name,region_id").order("name"),
      supabase.from("channel").select("id,name").eq("is_active", true).order("name"),
    ]);
    rows = (sc.data ?? []) as unknown as Record<string, unknown>[];

    (regions.data ?? []).forEach((r) => maps.region.set(r.id, r.name));
    (agents.data ?? []).forEach((a) => {
      if (a.name) maps.agent.set(a.id, a.name);
      if (a.city_id) agentCity.set(a.id, a.city_id);
    });
    (cities.data ?? []).forEach((c) => {
      maps.city.set(c.id, c.name);
      if (c.region_id) cityRegion.set(c.id, c.region_id);
    });
    (channels.data ?? []).forEach((c) => maps.channel.set(c.id, c.name));

    regionOpts = (regions.data ?? []).map((r) => ({ id: r.id, name: r.name }));
    cityOpts = (cities.data ?? []).map((c) => ({ id: c.id, name: c.name }));
    distributorOpts = (agents.data ?? [])
      .filter((a) => a.type === "distributor")
      .map((a) => ({ id: a.id, name: a.code ? `${a.name} (${a.code})` : a.name }));
    channelOpts = (channels.data ?? []).map((c) => ({ id: c.id, name: c.name }));
  }
  const nameOf = (lvl: string, id: string) => maps[lvl]?.get(id) ?? (id ? id.slice(0, 8) : "—");

  // Resolve each scorecard row's region / city / distributor for hierarchy filtering.
  const resolve = (r: Record<string, unknown>) => {
    const lvl = String(r.level);
    const id = String(r.ent_id ?? "");
    if (lvl === "region") return { region: id, city: null as string | null, agent: null as string | null };
    if (lvl === "city") return { region: cityRegion.get(id) ?? null, city: id, agent: null as string | null };
    if (lvl === "agent") {
      const c = agentCity.get(id) ?? null;
      return { region: c ? cityRegion.get(c) ?? null : null, city: c, agent: id };
    }
    return { region: null as string | null, city: null as string | null, agent: null as string | null };
  };

  // Hierarchy filters (region / city / distributor) applied in JS over the resolved scope.
  if (regionF || cityF || distributorF) {
    rows = rows.filter((r) => {
      const s = resolve(r);
      if (regionF && s.region !== regionF) return false;
      if (cityF && s.city !== cityF) return false;
      if (distributorF && s.agent !== distributorF) return false;
      return true;
    });
  }

  // Summary — counts/average always; sales totals only when unambiguous (no double-count).
  const scored = rows.filter((r) => r.sla_score != null);
  const avgScore = scored.length ? Math.round(scored.reduce((s, r) => s + Number(r.sla_score), 0) / scored.length) : null;
  const statusCounts: Record<string, number> = {};
  for (const r of rows) {
    const s = String(r.sla_status ?? "—");
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }
  const healthy = (statusCounts["Achieved"] ?? 0) + (statusCounts["On Track"] ?? 0);
  const attention = (statusCounts["At Risk"] ?? 0) + (statusCounts["Behind"] ?? 0) + (statusCounts["Critical"] ?? 0);

  const levelsPresent = new Set(rows.map((r) => String(r.level)));
  const moneySafe = rows.length > 0 && levelsPresent.size <= 1 && channel !== "__all__";
  const totalTarget = rows.reduce((s, r) => s + Number(r.sales_target ?? 0), 0);
  const totalActual = rows.reduce((s, r) => s + Number(r.actual_sales ?? 0), 0);
  const overallAch = totalTarget > 0 ? Math.round((100 * totalActual) / totalTarget) : null;

  const filtersActive = level !== "all" || regionF || cityF || distributorF || channel !== "" || statusF || scoreMin != null || scoreMax != null;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">SLA Report</h1>
          <p className="text-sm text-muted">Combined scorecard — sales, customer coverage, sales-force capacity, and service capability.</p>
        </div>
      </div>

      {!month ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-ink">No SLA targets yet</p>
          <p className="mt-1 text-sm text-muted">Add Sales Targets (and optionally Coverage/Capability) in SLA &amp; Coverage Setup, then import data.</p>
          <Link href="/sla-targets" className="mt-4 inline-block rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream">Go to SLA &amp; Coverage Setup</Link>
        </Card>
      ) : (
        <>
          {/* Filters */}
          <Card className="p-4">
            <form action="/sla-report" method="get" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
              <label className="space-y-1">
                <span className="block text-xs font-medium uppercase tracking-wide text-muted">Month</span>
                <select name="month" defaultValue={month} className={selectCls}>
                  {monthList.map((m) => (
                    <option key={m} value={m}>{m.slice(0, 7)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium uppercase tracking-wide text-muted">Level</span>
                <select name="level" defaultValue={level} className={selectCls}>
                  <option value="all">All levels</option>
                  <option value="region">Region</option>
                  <option value="city">City</option>
                  <option value="distributor">Distributor</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium uppercase tracking-wide text-muted">Region</span>
                <select name="region" defaultValue={regionF} className={selectCls}>
                  <option value="">All regions</option>
                  {regionOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium uppercase tracking-wide text-muted">City</span>
                <select name="city" defaultValue={cityF} className={selectCls}>
                  <option value="">All cities</option>
                  {cityOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium uppercase tracking-wide text-muted">Distributor</span>
                <select name="distributor" defaultValue={distributorF} className={selectCls}>
                  <option value="">All distributors</option>
                  {distributorOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium uppercase tracking-wide text-muted">Channel</span>
                <select name="channel" defaultValue={channel} className={selectCls}>
                  <option value="">All-channels rollup</option>
                  <option value="__all__">Every channel row</option>
                  {channelOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium uppercase tracking-wide text-muted">SLA status</span>
                <select name="status" defaultValue={statusF} className={selectCls}>
                  <option value="">All statuses</option>
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <div className="space-y-1">
                <span className="block text-xs font-medium uppercase tracking-wide text-muted">Score range</span>
                <div className="flex items-center gap-1">
                  <input name="score_min" type="number" min="0" max="100" defaultValue={scoreMin ?? ""} placeholder="min" className={selectCls} />
                  <span className="text-muted">–</span>
                  <input name="score_max" type="number" min="0" max="100" defaultValue={scoreMax ?? ""} placeholder="max" className={selectCls} />
                </div>
              </div>
              <div className="col-span-2 flex items-end gap-2 sm:col-span-3 lg:col-span-4 xl:col-span-8">
                <button type="submit" className="rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">Apply filters</button>
                {filtersActive && (
                  <Link href={`/sla-report?month=${month}`} className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:text-burgundy">Reset</Link>
                )}
              </div>
            </form>
          </Card>

          {/* KPI summary (reflects active filters) */}
          {rows.length > 0 && (
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-line bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Entries</p>
                <p className="mt-1 font-serif text-3xl font-bold text-ink">{rows.length}</p>
                <p className="mt-1 text-xs text-muted">targets in view</p>
              </div>
              <div className="rounded-2xl border border-line bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Avg SLA score</p>
                <p className="mt-1 font-serif text-3xl font-bold text-ink">{avgScore ?? "—"}</p>
                <p className="mt-1 text-xs text-muted">across {scored.length} scored {scored.length === 1 ? "entry" : "entries"}</p>
              </div>
              <div className="rounded-2xl border border-line bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Achieved / On Track</p>
                <p className="mt-1 font-serif text-3xl font-bold text-emerald-700">{healthy}</p>
                <p className="mt-1 text-xs text-muted">of {rows.length} entries</p>
              </div>
              {moneySafe ? (
                <div className="rounded-2xl border border-line bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Sales achievement</p>
                  <p className="mt-1 font-serif text-3xl font-bold text-ink">{overallAch != null ? `${overallAch}%` : "—"}</p>
                  <p className="mt-1 text-xs text-muted">{SAR(totalActual)} / {SAR(totalTarget)}</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-line bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">At Risk / Behind / Critical</p>
                  <p className="mt-1 font-serif text-3xl font-bold text-roshen-red">{attention}</p>
                  <p className="mt-1 text-xs text-muted">need attention</p>
                </div>
              )}
            </section>
          )}

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_ORDER.filter((s) => statusCounts[s]).map((s) => (
                <span key={s} className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " + (STATUS_STYLE[s] ?? "bg-cream-deep text-muted")}>
                  {s} × {statusCounts[s]}
                </span>
              ))}
              {!moneySafe && (
                <span className="text-xs text-muted">Sales totals hidden — pick a single Level (and a single channel view) to sum sales without double-counting.</span>
              )}
            </div>
          )}

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
                <tr><td colSpan={17} className="px-4 py-12 text-center text-sm text-muted">
                  {filtersActive ? "No scorecard rows match the current filters." : "No targets for this month."}
                </td></tr>
              ) : (
                rows.map((r, i) => {
                  const lvl = String(r.level);
                  const status = String(r.sla_status ?? "");
                  return (
                    <tr key={i} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                      <td className="px-3 py-2 capitalize text-muted">{lvl === "agent" ? "Distributor" : lvl}</td>
                      <td className="px-3 py-2 font-medium text-ink">{nameOf(lvl, String(r.ent_id))}</td>
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
        </>
      )}
    </div>
  );
}
