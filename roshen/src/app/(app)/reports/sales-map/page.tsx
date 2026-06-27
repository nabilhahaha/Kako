import { Wallet, Layers, TrendingUp, Boxes, MapPin, FileText, type LucideIcon } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/req-meta";
import { SalesBubbleMap, type CityPoint, type MapLabels } from "@/components/app/reports/sales-bubble-map";

type SP = { period?: string; region?: string; city?: string; distributor?: string; manager?: string; main?: string; sub?: string };

function quarterMonths(q: string): string[] {
  const m = q.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return [];
  const y = m[1]; const base = (Number(m[2]) - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${y}-${String(base + i).padStart(2, "0")}-01`);
}

export default async function SalesMapPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();

  const [channelsR, regionsR, citiesR, agentsR, monthsR, profilesR] = await Promise.all([
    supabase.from("channel").select("id,code,name,parent_id,is_active").order("name"),
    supabase.from("region").select("id,name").order("name"),
    supabase.from("city").select("id,name,region_id,latitude,longitude,region:region_id(name)").order("name"),
    supabase.from("agent").select("id,name,area_manager_id").eq("type", "distributor").order("name"),
    supabase.from("sales_geo_line").select("period_month"),
    supabase.from("profile").select("id,full_name,email"),
  ]);

  const channels = channelsR.data ?? [];
  const chName = new Map(channels.map((c) => [c.id as string, c.name as string]));
  const ttId = channels.find((c) => c.code === "TT" && !c.parent_id)?.id as string | undefined;
  const mtId = channels.find((c) => c.code === "MT" && !c.parent_id)?.id as string | undefined;
  const mainOpts = channels.filter((c) => !c.parent_id).map((c) => ({ value: c.id as string, label: c.name as string }));
  const subOpts = channels.filter((c) => c.parent_id).map((c) => ({ value: c.id as string, label: c.name as string }));
  const regionOpts = (regionsR.data ?? []).map((r) => ({ value: r.id as string, label: r.name as string }));
  const cityOpts = (citiesR.data ?? []).map((c) => ({ value: c.id as string, label: c.name as string }));
  const distOpts = (agentsR.data ?? []).map((a) => ({ value: a.id as string, label: a.name as string }));
  const agentName = new Map((agentsR.data ?? []).map((a) => [a.id as string, a.name as string]));

  // Manager filter: managers assigned to distributors → restrict to their distributors.
  const pName = new Map((profilesR.data ?? []).map((p) => [p.id as string, (p.full_name as string) || (p.email as string) || "—"]));
  const managerIds = [...new Set((agentsR.data ?? []).map((a) => a.area_manager_id as string | null).filter(Boolean) as string[])];
  const managerOpts = managerIds.map((id) => ({ value: id, label: pName.get(id) ?? "—" }));
  const agentsByManager = (mgr: string) => (agentsR.data ?? []).filter((a) => a.area_manager_id === mgr).map((a) => a.id as string);

  // Period options (months + quarters) from available data.
  const monthSet = new Set<string>();
  for (const r of monthsR.data ?? []) if (r.period_month) monthSet.add(String(r.period_month).slice(0, 7));
  const months = [...monthSet].sort().reverse();
  const quarters = [...new Set(months.map((m) => `${m.slice(0, 4)}-Q${Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1}`))].sort().reverse();

  // Filtered geo lines (RLS-scoped via the view).
  let q = supabase.from("sales_geo_line").select("city_id,city_source,region_id,agent_id,main_channel_id,sub_channel_id,invoice_number,customer_code,net_sales,cartons,invoice_date");
  if (sp.region) q = q.eq("region_id", sp.region);
  if (sp.city) q = q.eq("city_id", sp.city);
  if (sp.distributor) q = q.eq("agent_id", sp.distributor);
  if (sp.manager) { const ids = agentsByManager(sp.manager); q = q.in("agent_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]); }
  if (sp.main) q = q.eq("main_channel_id", sp.main);
  if (sp.sub) q = q.eq("sub_channel_id", sp.sub);
  if (sp.period && /^\d{4}-Q[1-4]$/.test(sp.period)) q = q.in("period_month", quarterMonths(sp.period));
  else if (sp.period && /^\d{4}-\d{2}$/.test(sp.period)) q = q.eq("period_month", `${sp.period}-01`);
  const lines = (await q).data ?? [];

  // Aggregate per city.
  type Agg = { sales: number; vol: number; inv: Set<string>; cust: Set<string>; dist: Set<string>; mains: Set<string>; subs: Set<string>; last: string };
  const byCity = new Map<string, Agg>();
  const invAll = new Set<string>();
  const byDist = new Map<string, number>();
  let total = 0, tt = 0, mt = 0, vol = 0, unassigned = 0;
  for (const l of lines) {
    const sales = Number(l.net_sales ?? 0); const cart = Number(l.cartons ?? 0);
    total += sales; vol += cart;
    if (l.main_channel_id === ttId) tt += sales;
    if (l.main_channel_id === mtId) mt += sales;
    if (l.invoice_number) invAll.add(String(l.invoice_number));
    if (l.agent_id) byDist.set(l.agent_id as string, (byDist.get(l.agent_id as string) ?? 0) + sales);
    const cid = l.city_id as string | null;
    if (!cid) { unassigned += sales; continue; }
    let a = byCity.get(cid);
    if (!a) { a = { sales: 0, vol: 0, inv: new Set(), cust: new Set(), dist: new Set(), mains: new Set(), subs: new Set(), last: "" }; byCity.set(cid, a); }
    a.sales += sales; a.vol += cart;
    if (l.invoice_number) a.inv.add(String(l.invoice_number));
    if (l.customer_code) a.cust.add(String(l.customer_code));
    if (l.agent_id) a.dist.add(l.agent_id as string);
    if (l.main_channel_id) a.mains.add(l.main_channel_id as string);
    if (l.sub_channel_id) a.subs.add(l.sub_channel_id as string);
    const d = l.invoice_date ? String(l.invoice_date).slice(0, 10) : "";
    if (d > a.last) a.last = d;
  }

  const cityPoints: CityPoint[] = (citiesR.data ?? [])
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => {
      const a = byCity.get(c.id as string);
      const region = (Array.isArray(c.region) ? c.region[0] : c.region) as { name?: string } | null;
      return {
        id: c.id as string, name: c.name as string, region: region?.name ?? "—",
        lat: Number(c.latitude), lng: Number(c.longitude),
        sales: a?.sales ?? 0, salesLabel: money(a?.sales ?? 0, "SAR"),
        volume: a ? a.vol.toLocaleString("en-US") : "0",
        invoices: a?.inv.size ?? 0, customers: a?.cust.size ?? 0,
        distributors: a ? [...a.dist].map((id) => agentName.get(id) ?? "—") : [],
        mains: a ? [...a.mains].map((id) => chName.get(id) ?? "—") : [],
        subs: a ? [...a.subs].map((id) => chName.get(id) ?? "—") : [],
        lastActivity: a?.last ?? "",
      };
    });

  const activeCities = cityPoints.filter((c) => c.sales > 0).length;
  const topCities = [...cityPoints].filter((c) => c.sales > 0).sort((a, b) => b.sales - a.sales).slice(0, 6);
  const topDists = [...byDist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const lastImport = (await supabase.from("import_batch").select("imported_at").eq("status", "imported").order("imported_at", { ascending: false }).limit(1)).data?.[0]?.imported_at;

  const kpis: { label: string; value: string; icon: LucideIcon; chip: string }[] = [
    { label: t("smap.kpi.total_sales"), value: money(total, "SAR"), icon: Wallet, chip: "bg-burgundy-soft text-burgundy" },
    { label: t("smap.kpi.tt"), value: money(tt, "SAR"), icon: Layers, chip: "bg-sky-50 text-sky-700" },
    { label: t("smap.kpi.mt"), value: money(mt, "SAR"), icon: TrendingUp, chip: "bg-emerald-50 text-emerald-700" },
    { label: t("smap.kpi.volume"), value: vol.toLocaleString("en-US"), icon: Boxes, chip: "bg-gold-soft/50 text-chocolate" },
    { label: t("smap.kpi.active_cities"), value: String(activeCities), icon: MapPin, chip: "bg-burgundy-soft text-burgundy" },
    { label: t("smap.kpi.invoices"), value: invAll.size.toLocaleString("en-US"), icon: FileText, chip: "bg-cream-deep text-chocolate" },
  ];

  const mapLabels: MapLabels = {
    hint: t("smap.map_hint"), city: t("smap.city"), region: t("smap.region"), sales: t("smap.sales"),
    volume: t("smap.volume"), invoices: t("smap.invoices"), customers: t("smap.customers"),
    distributors: t("smap.distributors"), main: t("smap.main_channel"), sub: t("smap.sub_channel"),
    last: t("smap.last_activity"), view: t("smap.view_report"),
    legend: t("smap.legend"), legendSize: t("smap.legend_size"),
    legendLow: t("smap.legend_low"), legendHigh: t("smap.legend_high"), attr: t("smap.attr_note"),
  };
  const topCityMax = Math.max(1, ...topCities.map((c) => c.sales));
  const topDistMax = Math.max(1, ...topDists.map(([, v]) => v));

  const sel = (name: string, val: string | undefined, opts: { value: string; label: string }[], ph: string) => (
    <select name={name} defaultValue={val ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
      <option value="">{ph}: {t("common.all")}</option>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 ps-12 lg:ps-0">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("smap.title")}</h1>
        <p className="text-sm text-muted">{t("smap.sub")}</p>
      </div>

      {/* Filters */}
      <Card className="p-3">
        <form action="/reports/sales-map" method="get" className="flex flex-wrap items-end gap-2">
          <select name="period" defaultValue={sp.period ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
            <option value="">{t("smap.filter.period")}: {t("common.all")}</option>
            {quarters.map((qx) => <option key={qx} value={qx}>{qx.replace("-", " ")}</option>)}
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {sel("region", sp.region, regionOpts, t("smap.filter.region"))}
          {sel("city", sp.city, cityOpts, t("smap.filter.city"))}
          {sel("manager", sp.manager, managerOpts, t("smap.filter.manager"))}
          {sel("distributor", sp.distributor, distOpts, t("smap.filter.distributor"))}
          {sel("main", sp.main, mainOpts, t("smap.filter.main"))}
          {sel("sub", sp.sub, subOpts, t("smap.filter.sub"))}
          <button type="submit" className="rounded-xl bg-burgundy px-3 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">{t("common.apply_filters")}</button>
        </form>
      </Card>

      {/* KPI cards */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4">
              <span className={"inline-flex h-9 w-9 items-center justify-center rounded-xl " + c.chip}><Icon className="h-5 w-5" /></span>
              <p className="mt-2 font-serif text-xl font-bold leading-none text-ink">{c.value}</p>
              <p className="mt-1 text-xs font-medium text-muted">{c.label}</p>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Map */}
        <div className="lg:col-span-2">
          <SalesBubbleMap cities={cityPoints} labels={mapLabels} />
          {total === 0 && <p className="mt-2 text-sm text-muted">{t("smap.no_data")}</p>}
          {unassigned > 0 && (
            <p className="mt-1 text-xs font-medium text-amber-700">{t("smap.unassigned")}: {money(unassigned, "SAR")}</p>
          )}
        </div>

        {/* Side panels */}
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("smap.top_cities")}</h2>
            <div className="mt-3 space-y-2.5 text-sm">
              {topCities.length === 0 ? <p className="text-muted">—</p> : topCities.map((c) => (
                <div key={c.id}>
                  <div className="flex justify-between"><span className="text-ink">{c.name}</span><span className="text-muted">{c.salesLabel}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-cream-deep"><div className="h-1.5 rounded-full bg-burgundy" style={{ width: `${Math.round((100 * c.sales) / topCityMax)}%` }} /></div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("smap.by_distributor")}</h2>
            <div className="mt-3 space-y-2.5 text-sm">
              {topDists.length === 0 ? <p className="text-muted">—</p> : topDists.map(([id, v]) => (
                <div key={id}>
                  <div className="flex justify-between"><span className="text-ink">{agentName.get(id) ?? "—"}</span><span className="text-muted">{money(v, "SAR")}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-cream-deep"><div className="h-1.5 rounded-full bg-gold" style={{ width: `${Math.round((100 * v) / topDistMax)}%` }} /></div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("smap.tt_mt")}</h2>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-ink">TT</span><span className="text-muted">{money(tt, "SAR")}</span></div>
              <div className="flex justify-between"><span className="text-ink">MT</span><span className="text-muted">{money(mt, "SAR")}</span></div>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-cream-deep">
                <div className="bg-burgundy" style={{ width: `${total ? Math.round((100 * tt) / total) : 0}%` }} />
                <div className="bg-emerald-500" style={{ width: `${total ? Math.round((100 * mt) / total) : 0}%` }} />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("smap.freshness")}</h2>
            <p className="mt-2 text-sm text-muted">{t("smap.last_import")}: <span className="font-medium text-ink">{lastImport ? String(lastImport).slice(0, 10) : "—"}</span></p>
          </Card>
        </div>
      </div>
    </div>
  );
}
