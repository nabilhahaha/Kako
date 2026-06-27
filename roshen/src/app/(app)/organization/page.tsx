import Link from "next/link";
import {
  MapPin, Building, Truck, Radio, Users, Layers, UserCheck, AlertTriangle,
  ArrowRight, type LucideIcon,
} from "lucide-react";
import { requireProfile, isGlobalRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";

const rel = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v as T)) ?? null;

export default async function OrganizationOverviewPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();
  const isGlobal = isGlobalRole(profile!.role);

  const [regionsR, citiesR, distsR, channelsR, covR, scopeR, profilesR] = await Promise.all([
    supabase.from("region").select("id,name").order("name"),
    supabase.from("city").select("id,region_id"),
    supabase.from("agent").select("id,is_active,area_manager_id").eq("type", "distributor"),
    supabase.from("channel").select("id,is_active,parent_id"),
    supabase.from("distributor_coverage").select("region_id,city_id,region:region_id(name),main:main_channel_id(code),sub:sub_channel_id(name)"),
    supabase.from("user_scope").select("user_id"),
    supabase.from("profile").select("id"),
  ]);

  const regions = regionsR.data ?? [];
  const cities = citiesR.data ?? [];
  const dists = distsR.data ?? [];
  const channels = channelsR.data ?? [];
  const cov = (covR.data ?? []) as Record<string, unknown>[];
  const scoped = new Set((scopeR.data ?? []).map((s) => s.user_id as string));
  const profilesTotal = (profilesR.data ?? []).length;

  const activeDists = dists.filter((d) => d.is_active).length;
  const inactiveDists = dists.length - activeDists;
  const activeChannels = channels.filter((c) => c.is_active).length;
  const inactiveChannels = channels.length - activeChannels;
  const usersWith = scoped.size;
  const usersWithout = Math.max(0, profilesTotal - usersWith);
  const distNoManager = dists.filter((d) => d.is_active && !d.area_manager_id).length;

  // Coverage breakdowns
  const ttRows = cov.filter((c) => rel<{ code?: string }>(c.main)?.code === "TT").length;
  const mtRows = cov.filter((c) => rel<{ code?: string }>(c.main)?.code === "MT").length;
  const sgCities = new Set(cov.filter((c) => rel<{ name?: string }>(c.sub)?.name === "Small Grocery").map((c) => c.city_id as string).filter(Boolean)).size;
  const byRegion = new Map<string, number>();
  for (const c of cov) {
    const rn = rel<{ name?: string }>(c.region)?.name || "All Kingdom";
    byRegion.set(rn, (byRegion.get(rn) ?? 0) + 1);
  }
  const byRegionTop = [...byRegion.entries()].sort((a, b) => b[1] - a[1]);
  const byRegionMax = byRegionTop.length ? byRegionTop[0][1] : 1;

  // Cities without coverage (direct city row OR region-level row for their region)
  const coveredCity = new Set(cov.filter((c) => c.city_id).map((c) => c.city_id as string));
  const coveredRegion = new Set(cov.filter((c) => c.region_id && !c.city_id).map((c) => c.region_id as string));
  const citiesNoCoverage = cities.filter((c) => !coveredCity.has(c.id) && !coveredRegion.has(c.region_id as string)).length;

  const kpis: { label: string; value: number; icon: LucideIcon; chip: string }[] = [
    { label: t("org.regions"), value: regions.length, icon: MapPin, chip: "bg-burgundy-soft text-burgundy" },
    { label: t("org.cities"), value: cities.length, icon: Building, chip: "bg-sky-50 text-sky-700" },
    { label: t("org.distributors"), value: activeDists, icon: Truck, chip: "bg-emerald-50 text-emerald-700" },
    { label: t("org.coverage_rows"), value: cov.length, icon: Layers, chip: "bg-gold-soft/50 text-chocolate" },
    { label: t("org.channels"), value: activeChannels, icon: Radio, chip: "bg-burgundy-soft text-burgundy" },
    { label: t("org.users_with_scope"), value: usersWith, icon: UserCheck, chip: "bg-emerald-50 text-emerald-700" },
    { label: t("org.users_without_scope"), value: usersWithout, icon: Users, chip: usersWithout > 0 ? "bg-amber-50 text-amber-700" : "bg-cream-deep text-muted" },
  ];

  const alerts: { label: string; count: number; href: string }[] = [
    { label: t("org.a.users_no_scope"), count: usersWithout, href: "/users-scopes" },
    { label: t("org.a.cities_no_coverage"), count: citiesNoCoverage, href: "/organization/distributors" },
    { label: t("org.a.dist_no_manager"), count: distNoManager, href: "/organization/distributors" },
    { label: t("org.a.inactive_dist"), count: inactiveDists, href: "/organization/distributors" },
    { label: t("org.a.channels_inactive"), count: inactiveChannels, href: "/organization" },
  ].filter((a) => a.count > 0);

  const actions: { href: string; label: string; sub: string; icon: LucideIcon; chip: string; show: boolean }[] = [
    { href: "/organization/regions", label: t("org.regions"), sub: t("org.regions_sub"), icon: MapPin, chip: "bg-burgundy-soft text-burgundy", show: true },
    { href: "/organization/cities", label: t("org.cities"), sub: t("org.cities_sub"), icon: Building, chip: "bg-sky-50 text-sky-700", show: true },
    { href: "/organization/distributors", label: t("org.distributors"), sub: t("org.dist_sub"), icon: Truck, chip: "bg-emerald-50 text-emerald-700", show: true },
    { href: "/users-scopes", label: t("org.users"), sub: t("users.subtitle"), icon: Users, chip: "bg-cream-deep text-chocolate", show: isGlobal },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 ps-12 lg:ps-0">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("org.cc_title")}</h1>
        <p className="text-sm text-muted">{t("org.cc_sub")}</p>
      </div>

      {/* KPI cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4">
              <div className="flex items-start gap-3">
                <span className={"inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " + c.chip}><Icon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <p className="font-serif text-3xl font-bold leading-none text-ink">{c.value}</p>
                  <p className="mt-1 truncate text-sm font-medium text-muted">{c.label}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coverage summary */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-serif text-base font-semibold text-ink">{t("org.coverage_summary")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("org.tt_vs_mt")} value={`${ttRows} / ${mtRows}`} />
            <Stat label={t("org.sg_cities")} value={String(sgCities)} />
            <Stat label={t("org.active_inactive")} value={`${activeDists} / ${inactiveDists}`} />
            <Stat label={t("org.coverage_rows")} value={String(cov.length)} />
          </div>
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("org.by_region")}</p>
            <div className="mt-2 space-y-2">
              {byRegionTop.length === 0 ? <p className="text-sm text-muted">—</p> : byRegionTop.map(([rn, n]) => (
                <div key={rn}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink">{rn}</span>
                    <span className="text-muted">{n}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-cream-deep">
                    <div className="h-1.5 rounded-full bg-burgundy" style={{ width: `${Math.round((100 * n) / byRegionMax)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Needs attention */}
        <Card className="p-5">
          <h2 className="font-serif text-base font-semibold text-ink">{t("org.attention")}</h2>
          <div className="mt-3 space-y-2">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted">{t("org.all_good")}</p>
            ) : alerts.map((a) => (
              <Link key={a.label} href={a.href} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 hover:bg-cream/40">
                <span className="flex min-w-0 items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="truncate text-sm text-ink">{a.label}</span>
                </span>
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{a.count}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Quick actions / child route cards */}
      <section>
        <h2 className="mb-3 font-serif text-base font-semibold text-ink">{t("org.quick_actions")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {actions.filter((a) => a.show).map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.href} href={a.href} className="group rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-md">
                <span className={"inline-flex h-10 w-10 items-center justify-center rounded-xl " + a.chip}><Icon className="h-5 w-5" /></span>
                <p className="mt-3 font-serif text-base font-semibold text-ink">{a.label}</p>
                <p className="mt-1 text-sm text-muted">{a.sub}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-burgundy">{t("org.manage")} <ArrowRight className="h-3.5 w-3.5" /></span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-cream/30 p-3">
      <p className="font-serif text-xl font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}
