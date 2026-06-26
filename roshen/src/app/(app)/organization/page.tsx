import Link from "next/link";
import { Eye } from "lucide-react";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { EntityDialog, type DialogField } from "@/components/app/org/entity-dialog";
import { upsertRegion, upsertCity, upsertArea, upsertBranch, upsertAgent } from "@/lib/org";

const TABS = [
  { key: "regions", label: "Regions" },
  { key: "cities", label: "Cities" },
  { key: "areas", label: "Areas" },
  { key: "branches", label: "Branches" },
  { key: "agents", label: "Agents" },
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

  const [regionsOpt, areasOpt, citiesOpt, branchesOpt, channelsOpt] = await Promise.all([
    supabase.from("region").select("id,name").order("name"),
    supabase.from("area").select("id,name").order("name"),
    supabase.from("city").select("id,name").order("name"),
    supabase.from("branch").select("id,name").order("name"),
    supabase.from("channel").select("id,name").order("name"),
  ]);
  const opt = (rows: { id: string; name: string }[] | null) =>
    (rows ?? []).map((r) => ({ value: r.id, label: r.name }));

  let columns: string[] = [];
  let rows: Record<string, unknown>[] = [];
  let fields: DialogField[] = [];
  let action!: (fd: FormData) => Promise<void>;
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
      { name: "region_id", label: "Region", type: "select", options: opt(regionsOpt.data), allowEmpty: true },
    ];
    let query = supabase.from("city").select("id,name,region_id,region:region_id(name)").order("name");
    if (q) query = query.ilike("name", `%${q}%`);
    rows = ((await query).data as Record<string, unknown>[]) ?? [];
  } else if (tab === "areas") {
    addLabel = "Add Area";
    action = upsertArea;
    columns = ["Name", "Code", "Region"];
    fields = [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text" },
      { name: "region_id", label: "Region", type: "select", required: true, options: opt(regionsOpt.data) },
    ];
    let query = supabase.from("area").select("id,name,code,region_id,region:region_id(name)").order("name");
    if (q) query = query.ilike("name", `%${q}%`);
    rows = ((await query).data as Record<string, unknown>[]) ?? [];
  } else if (tab === "branches") {
    addLabel = "Add Branch";
    action = upsertBranch;
    columns = ["Name", "Code", "Area", "City"];
    fields = [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text" },
      { name: "area_id", label: "Area", type: "select", required: true, options: opt(areasOpt.data) },
      { name: "city_id", label: "City", type: "select", options: opt(citiesOpt.data), allowEmpty: true },
    ];
    let query = supabase
      .from("branch")
      .select("id,name,code,area_id,city_id,area:area_id(name),city:city_id(name)")
      .order("name");
    if (q) query = query.ilike("name", `%${q}%`);
    rows = ((await query).data as Record<string, unknown>[]) ?? [];
  } else {
    addLabel = "Add Agent";
    action = upsertAgent;
    columns = ["Name", "Code", "Type", "Branch", "Channel", "Status"];
    fields = [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "type", label: "Type", type: "select", required: true, options: [
        { value: "distributor", label: "Distributor" },
        { value: "agent", label: "Agent" },
      ] },
      { name: "branch_id", label: "Branch", type: "select", required: true, options: opt(branchesOpt.data) },
      { name: "channel_id", label: "Channel", type: "select", options: opt(channelsOpt.data), allowEmpty: true },
      { name: "is_active", label: "Active", type: "checkbox" },
    ];
    let query = supabase
      .from("agent")
      .select("id,name,code,type,is_active,branch_id,channel_id,branch:branch_id(name),channel:channel_id(name)")
      .order("name");
    if (q) query = query.ilike("name", `%${q}%`);
    rows = ((await query).data as Record<string, unknown>[]) ?? [];
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">Organization</h1>
          <p className="text-sm text-muted">
            {isAdmin
              ? "Manage the KSA hierarchy: regions, cities, areas, branches, and agents."
              : "Review the KSA organization structure (read-only)."}
          </p>
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
            href={`/app/organization?tab=${t.key}`}
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
        <form className="flex-1" action="/app/organization" method="get">
          <input type="hidden" name="tab" value={tab} />
          <input
            name="q"
            defaultValue={q}
            placeholder={`Search ${tab}…`}
            className="w-full max-w-xs rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15"
          />
        </form>
        {isAdmin && <EntityDialog title={addLabel} fields={fields} action={action} />}
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
                      <EntityDialog title={addLabel} mode="edit" fields={fields} action={action} initial={initialFor(tab, r)} />
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

function Cells({ tab, row }: { tab: TabKey; row: Record<string, unknown> }) {
  if (tab === "regions")
    return (<><td className="px-4 py-2.5 font-medium text-ink">{txt(row.name)}</td><td className="px-4 py-2.5 text-muted">{txt(row.code)}</td></>);
  if (tab === "cities")
    return (<><td className="px-4 py-2.5 font-medium text-ink">{txt(row.name)}</td><td className="px-4 py-2.5 text-muted">{rel(row.region)}</td></>);
  if (tab === "areas")
    return (<><td className="px-4 py-2.5 font-medium text-ink">{txt(row.name)}</td><td className="px-4 py-2.5 text-muted">{txt(row.code)}</td><td className="px-4 py-2.5 text-muted">{rel(row.region)}</td></>);
  if (tab === "branches")
    return (<><td className="px-4 py-2.5 font-medium text-ink">{txt(row.name)}</td><td className="px-4 py-2.5 text-muted">{txt(row.code)}</td><td className="px-4 py-2.5 text-muted">{rel(row.area)}</td><td className="px-4 py-2.5 text-muted">{rel(row.city)}</td></>);
  return (
    <>
      <td className="px-4 py-2.5 font-medium text-ink">{txt(row.name)}</td>
      <td className="px-4 py-2.5 text-muted">{txt(row.code)}</td>
      <td className="px-4 py-2.5 capitalize text-muted">{txt(row.type)}</td>
      <td className="px-4 py-2.5 text-muted">{rel(row.branch)}</td>
      <td className="px-4 py-2.5 text-muted">{rel(row.channel)}</td>
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
  if (tab === "cities") return { ...base, region_id: (r.region_id as string) ?? "" };
  if (tab === "areas") return { ...base, code: (r.code as string) ?? "", region_id: (r.region_id as string) ?? "" };
  if (tab === "branches") return { ...base, code: (r.code as string) ?? "", area_id: (r.area_id as string) ?? "", city_id: (r.city_id as string) ?? "" };
  return {
    ...base,
    code: (r.code as string) ?? "",
    type: (r.type as string) ?? "distributor",
    branch_id: (r.branch_id as string) ?? "",
    channel_id: (r.channel_id as string) ?? "",
    is_active: Boolean(r.is_active),
  };
}
