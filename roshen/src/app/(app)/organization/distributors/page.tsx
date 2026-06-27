import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { DistributorDialog } from "@/components/app/org/distributor-dialog";
import { upsertDistributor } from "@/lib/org";

const txt = (v: unknown) => (v == null || v === "" ? "—" : String(v));
const person = (v: unknown) => {
  const o = (Array.isArray(v) ? v[0] : v) as { full_name?: string; email?: string } | null;
  return o && typeof o === "object" ? txt(o.full_name || o.email) : "—";
};

export default async function DistributorsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { profile } = await requireProfile();
  const isAdmin = isAdminRole(profile!.role);
  const supabase = await createClient();
  const { t } = await getT();

  const [regionsRes, citiesRes, channelsRes, amRes] = await Promise.all([
    supabase.from("region").select("id,name").order("name"),
    supabase.from("city").select("id,name,region_id,region:region_id(name)").order("name"),
    supabase.from("channel").select("id,name").is("parent_id", null).order("name"),
    supabase.from("profile").select("id,full_name,email,role").eq("is_active", true).order("full_name"),
  ]);
  const regionOpts = (regionsRes.data ?? []).map((r) => ({ value: r.id, label: r.name }));
  const cityOpts = (citiesRes.data ?? []).map((c) => {
    const region = (Array.isArray(c.region) ? c.region[0] : c.region) as { name?: string } | null;
    return { value: c.id as string, label: region?.name ? `${c.name} — ${region.name}` : (c.name as string), region_id: (c.region_id as string) ?? null };
  });
  const channelOpts = (channelsRes.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const amOpts = (amRes.data ?? []).map((p) => {
    const nm = (p.full_name as string) || (p.email as string) || "User";
    return { value: p.id as string, label: p.role ? `${nm} — ${t(`role.${p.role}`)}` : nm };
  });

  let query = supabase
    .from("agent")
    .select("id,name,code,is_active,city_id,channel_id,area_manager_id,area_manager:area_manager_id(full_name,email)")
    .eq("type", "distributor")
    .order("is_active", { ascending: false })
    .order("name");
  if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
  let rows = ((await query).data as unknown as Record<string, unknown>[]) ?? [];

  const { data: cov } = await supabase
    .from("distributor_coverage")
    .select("distributor_id, region:region_id(name), city:city_id(name), sub:sub_channel_id(name)");
  const sum = new Map<string, { areas: Set<string>; subs: Set<string> }>();
  for (const c of cov ?? []) {
    const id = c.distributor_id as string;
    if (!sum.has(id)) sum.set(id, { areas: new Set(), subs: new Set() });
    const e = sum.get(id)!;
    const city = (Array.isArray(c.city) ? c.city[0] : c.city) as { name?: string } | null;
    const region = (Array.isArray(c.region) ? c.region[0] : c.region) as { name?: string } | null;
    e.areas.add(city?.name || region?.name || "All Kingdom");
    const s = (Array.isArray(c.sub) ? c.sub[0] : c.sub) as { name?: string } | null;
    if (s?.name) e.subs.add(s.name);
  }
  rows = rows.map((r) => {
    const e = sum.get(r.id as string);
    const summary = e ? `${[...e.areas].join(", ")}${e.subs.size ? " — " + [...e.subs].join(", ") : ""}` : "";
    return { ...r, _coverage: summary };
  });

  const initialFor = (r: Record<string, unknown>) => ({
    id: String(r.id), name: (r.name as string) ?? "", code: (r.code as string) ?? "",
    city_id: (r.city_id as string) ?? "", channel_id: (r.channel_id as string) ?? "",
    area_manager_id: (r.area_manager_id as string) ?? "", is_active: Boolean(r.is_active),
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 ps-12 lg:ps-0">
      <Link href="/organization" className="inline-flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
        <ArrowLeft className="h-4 w-4" /> {t("org.title")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("org.distributors")}</h1>
          <p className="text-sm text-muted">{t("org.dist_sub")}</p>
        </div>
        {isAdmin
          ? <DistributorDialog regions={regionOpts} cities={cityOpts} channels={channelOpts} areaManagers={amOpts} action={upsertDistributor} />
          : <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted"><Eye className="h-3.5 w-3.5" /> {t("org.view_only")}</span>}
      </div>

      <form action="/organization/distributors" method="get">
        <input name="q" defaultValue={q} placeholder={t("org.search")} className="w-full max-w-xs rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15" />
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-cream-deep/40 text-start text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 text-start font-semibold">{t("org.name")}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t("org.code")}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t("org.coverage")}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t("org.assigned_manager")}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t("org.status")}</th>
              {isAdmin && <th className="px-4 py-2.5 text-end font-semibold">{t("common.actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center text-sm text-muted">{t("org.empty")}</td></tr>
            ) : rows.map((r) => (
              <tr key={String(r.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                <td className="px-4 py-2.5 font-medium text-ink">{txt(r.name)}</td>
                <td className="px-4 py-2.5 text-muted">{txt(r.code)}</td>
                <td className="px-4 py-2.5 text-muted"><span className="block max-w-md">{txt(r._coverage)}</span></td>
                <td className="px-4 py-2.5 text-muted">{person(r.area_manager)}</td>
                <td className="px-4 py-2.5">
                  <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " + (r.is_active ? "bg-emerald-50 text-emerald-700" : "bg-cream-deep text-muted")}>
                    {r.is_active ? t("org.active") : t("org.inactive")}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-2.5 text-end">
                    <DistributorDialog mode="edit" regions={regionOpts} cities={cityOpts} channels={channelOpts} areaManagers={amOpts} action={upsertDistributor} initial={initialFor(r)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
