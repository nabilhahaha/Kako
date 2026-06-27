import Link from "next/link";
import { Eye } from "lucide-react";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { EntityDialog, type DialogField } from "@/components/app/org/entity-dialog";
import { DistributorDialog } from "@/components/app/org/distributor-dialog";
import { upsertRegion, upsertCity, upsertDistributor } from "@/lib/org";

// Roshen KSA simplified structure: Region → City → Distributor.
// Areas & Branches remain in the database for future expansion but are not
// surfaced as tabs in the current UI.
const TABS = [
  { key: "regions", label: "Regions" },
  { key: "cities", label: "Cities" },
  { key: "distributors", label: "Distributors" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function OrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "regions") as TabKey;
  const q = (sp.q ?? "").trim();

  const { profile } = await requireProfile();
  const isAdmin = isAdminRole(profile!.role);
  const supabase = await createClient();
  const { t } = await getT();

  const [regionsRes, citiesRes, channelsRes, amRes] = await Promise.all([
    supabase.from("region").select("id,name").order("name"),
    supabase.from("city").select("id,name,region_id,region:region_id(name)").order("name"),
    supabase.from("channel").select("id,name").order("name"),
    // Any active user can be a distributor's assigned manager (the real
    // structure assigns managers across roles, not only area_manager).
    supabase
      .from("profile")
      .select("id,full_name,email,role")
      .eq("is_active", true)
      .order("full_name"),
  ]);
  const opt = (rows: { id: string; name: string }[] | null) =>
    (rows ?? []).map((r) => ({ value: r.id, label: r.name }));

  const regionOpts = opt(regionsRes.data);
  const cityOpts = (citiesRes.data ?? []).map((c) => {
    const region = (Array.isArray(c.region) ? c.region[0] : c.region) as { name?: string } | null;
    return {
      value: c.id as string,
      label: region?.name ? `${c.name} — ${region.name}` : (c.name as string),
      region_id: (c.region_id as string) ?? null,
    };
  });
  const channelOpts = opt(channelsRes.data);
  const amOpts = (amRes.data ?? []).map((p) => {
    const nm = (p.full_name as string) || (p.email as string) || "User";
    const roleLabel = p.role ? t(`role.${p.role}`) : "";
    return { value: p.id as string, label: roleLabel ? `${nm} — ${roleLabel}` : nm };
  });

  // -------- Regions / Cities (generic EntityDialog) --------
  let columns: string[] = [];
  let rows: Record<string, unknown>[] = [];
  let fields: DialogField[] = [];
  let action: ((fd: FormData) => Promise<void>) | undefined;
  let addLabel = "";

  if (tab === "regions") {
    addLabel = "Add Region";
    action = upsertRegion;
    columns = ["Name", "Code"];
    fields = [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text" },
    ];
    let query = supabase.from("region").select("id,name,code").order("name");
    if (q) query = query.ilike("name", `%${q}%`);
    rows = ((await query).data as Record<string, unknown>[]) ?? [];
  } else if (tab === "cities") {
    addLabel = "Add City";
    action = upsertCity;
    columns = ["Name", "Region"];
    fields = [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "region_id", label: "Region", type: "select", options: regionOpts, allowEmpty: true },
    ];
    let query = supabase
      .from("city")
      .select("id,name,region_id,region:region_id(name)")
      .order("name");
    if (q) query = query.ilike("name", `%${q}%`);
    rows = ((await query).data as Record<string, unknown>[]) ?? [];
  } else {
    // distributors — master records; multi region/city/channel coverage lives
    // in distributor_coverage and is summarised in the Coverage column.
    columns = ["Name", "Code", "Coverage", "Assigned Manager", "Status"];
    let query = supabase
      .from("agent")
      .select(
        "id,name,code,is_active,city_id,channel_id,area_manager_id," +
          "area_manager:area_manager_id(full_name,email)",
      )
      .eq("type", "distributor")
      .order("is_active", { ascending: false })
      .order("name");
    if (q) query = query.ilike("name", `%${q}%`);
    rows = ((await query).data as unknown as Record<string, unknown>[]) ?? [];

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
      const sub = (Array.isArray(c.sub) ? c.sub[0] : c.sub) as { name?: string } | null;
      if (sub?.name) e.subs.add(sub.name);
    }
    rows = rows.map((r) => {
      const e = sum.get(r.id as string);
      const summary = e
        ? `${[...e.areas].join(", ")}${e.subs.size ? " — " + [...e.subs].join(", ") : ""}`
        : "";
      return { ...r, _coverage: summary };
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("org.title")}</h1>
          <p className="text-sm text-muted">{t("org.desc")}</p>
        </div>
        {!isAdmin && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted">
            <Eye className="h-3.5 w-3.5" /> View only
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/organization?tab=${t.key}`}
            className={
              "rounded-t-lg px-4 py-2 text-sm font-medium " +
              (t.key === tab
                ? "border-b-2 border-burgundy text-burgundy"
                : "text-muted hover:text-burgundy")
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex-1" action="/organization" method="get">
          <input type="hidden" name="tab" value={tab} />
          <input
            name="q"
            defaultValue={q}
            placeholder={`Search ${tab}…`}
            className="w-full max-w-xs rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15"
          />
        </form>
        {isAdmin &&
          (tab === "distributors" ? (
            <DistributorDialog
              regions={regionOpts}
              cities={cityOpts}
              channels={channelOpts}
              areaManagers={amOpts}
              action={upsertDistributor}
            />
          ) : (
            action && <EntityDialog title={addLabel} fields={fields} action={action} />
          ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-cream-deep/40 text-left text-xs uppercase tracking-wide text-muted">
              {columns.map((c) => (
                <th key={c} className="px-4 py-2.5 font-semibold">{c}</th>
              ))}
              {isAdmin && <th className="px-4 py-2.5 text-right font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (isAdmin ? 1 : 0)} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium text-ink">No {tab} found</p>
                  <p className="mt-1 text-xs text-muted">
                    {isAdmin ? `Add your first ${tab.slice(0, -1)} to get started.` : "Nothing in your scope yet."}
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <Cells tab={tab} row={r} />
                  {isAdmin && (
                    <td className="px-4 py-2.5 text-right">
                      {tab === "distributors" ? (
                        <DistributorDialog
                          mode="edit"
                          regions={regionOpts}
                          cities={cityOpts}
                          channels={channelOpts}
                          areaManagers={amOpts}
                          action={upsertDistributor}
                          initial={distributorInitial(r)}
                        />
                      ) : (
                        action && (
                          <EntityDialog
                            title={addLabel}
                            mode="edit"
                            fields={fields}
                            action={action}
                            initial={initialFor(tab, r)}
                          />
                        )
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function txt(v: unknown) {
  return v == null || v === "" ? "—" : String(v);
}
function rel(v: unknown) {
  const o = Array.isArray(v) ? v[0] : v;
  return o && typeof o === "object" ? txt((o as { name?: string }).name) : "—";
}
function person(v: unknown) {
  const o = (Array.isArray(v) ? v[0] : v) as { full_name?: string; email?: string } | null;
  if (!o || typeof o !== "object") return "—";
  return txt(o.full_name || o.email);
}

function Cells({ tab, row }: { tab: TabKey; row: Record<string, unknown> }) {
  if (tab === "regions")
    return (<><td className="px-4 py-2.5 font-medium text-ink">{txt(row.name)}</td><td className="px-4 py-2.5 text-muted">{txt(row.code)}</td></>);
  if (tab === "cities")
    return (<><td className="px-4 py-2.5 font-medium text-ink">{txt(row.name)}</td><td className="px-4 py-2.5 text-muted">{rel(row.region)}</td></>);
  return (
    <>
      <td className="px-4 py-2.5 font-medium text-ink">{txt(row.name)}</td>
      <td className="px-4 py-2.5 text-muted">{txt(row.code)}</td>
      <td className="px-4 py-2.5 text-muted"><span className="block max-w-md">{txt(row._coverage)}</span></td>
      <td className="px-4 py-2.5 text-muted">{person(row.area_manager)}</td>
      <td className="px-4 py-2.5">
        <span className={
          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
          (row.is_active ? "bg-emerald-50 text-emerald-700" : "bg-cream-deep text-muted")
        }>
          {row.is_active ? "Active" : "Inactive"}
        </span>
      </td>
    </>
  );
}

function initialFor(tab: TabKey, r: Record<string, unknown>): Record<string, string | boolean | null> {
  const base = { id: String(r.id), name: (r.name as string) ?? "" };
  if (tab === "regions") return { ...base, code: (r.code as string) ?? "" };
  return { ...base, region_id: (r.region_id as string) ?? "" }; // cities
}

function distributorInitial(r: Record<string, unknown>): Record<string, string | boolean | null> {
  return {
    id: String(r.id),
    name: (r.name as string) ?? "",
    code: (r.code as string) ?? "",
    city_id: (r.city_id as string) ?? "",
    channel_id: (r.channel_id as string) ?? "",
    area_manager_id: (r.area_manager_id as string) ?? "",
    is_active: Boolean(r.is_active),
  };
}
