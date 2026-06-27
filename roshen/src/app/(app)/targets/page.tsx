import Link from "next/link";
import { Eye } from "lucide-react";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { EntityDialog, type DialogField } from "@/components/app/org/entity-dialog";
import { ConfirmDelete } from "@/components/app/confirm-delete";
import {
  upsertSalesTarget,
  deleteSalesTarget,
  upsertCoverageTarget,
  deleteCoverageTarget,
  upsertCapability,
  deleteCapability,
} from "@/lib/sla";

const TABS = [
  { key: "sales", label: "Sales Targets" },
  { key: "coverage", label: "Coverage Targets" },
  { key: "capability", label: "Capability Setup" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type Level = "region" | "city" | "area" | "agent";
const LEVELS_BY_TAB: Record<TabKey, Level[]> = {
  sales: ["agent", "area", "region"],
  coverage: ["agent", "city", "region"],
  capability: ["agent", "city", "region"],
};
const LEVEL_LABEL: Record<Level, string> = {
  region: "Region",
  city: "City",
  area: "Area",
  agent: "Agent",
};

type Opt = { value: string; label: string };
const opt = (rows: { id: string; name: string }[] | null): Opt[] =>
  (rows ?? []).map((r) => ({ value: r.id, label: r.name }));

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtPeriod(v: unknown): string {
  const s = String(v ?? "");
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}` : "—";
}
function txt(v: unknown) {
  return v == null || v === "" ? "—" : String(v);
}
function rel(v: unknown): string {
  const o = Array.isArray(v) ? v[0] : v;
  return o && typeof o === "object" ? txt((o as { name?: string }).name) : "—";
}
/** First non-empty relation name across the scope columns = the row's entity. */
function entityName(row: Record<string, unknown>): string {
  for (const k of ["agent", "area", "city", "region"]) {
    const n = rel(row[k]);
    if (n !== "—") return n;
  }
  return "—";
}
function money(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function ok(v: unknown) {
  return v ? "Yes" : "No";
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; level?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "sales") as TabKey;
  const levels = LEVELS_BY_TAB[tab];
  const level = (levels.includes(sp.level as Level) ? (sp.level as Level) : levels[0]) as Level;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? (sp.period as string) : currentPeriod();
  const periodDate = `${period}-01`;

  const { profile } = await requireProfile();
  const isAdmin = isAdminRole(profile!.role);
  const supabase = await createClient();

  const [regionsOpt, citiesOpt, areasOpt, agentsOpt, channelsOpt] = await Promise.all([
    supabase.from("region").select("id,name").order("name"),
    supabase.from("city").select("id,name").order("name"),
    supabase.from("area").select("id,name").order("name"),
    supabase.from("agent").select("id,name").order("name"),
    supabase.from("channel").select("id,name").order("name"),
  ]);
  const entityOptions: Record<Level, Opt[]> = {
    region: opt(regionsOpt.data),
    city: opt(citiesOpt.data),
    area: opt(areasOpt.data),
    agent: opt(agentsOpt.data),
  };

  // Entity select for the active level + shared header fields.
  const entityField: DialogField = {
    name: `${level}_id`,
    label: LEVEL_LABEL[level],
    type: "select",
    required: true,
    options: entityOptions[level],
  };
  const baseFields: DialogField[] = [
    { name: "level", type: "hidden" },
    { name: "period_month", label: "Period (month)", type: "month", required: true },
    entityField,
  ];
  const channelField: DialogField = {
    name: "channel_id",
    label: "Channel",
    type: "select",
    options: opt(channelsOpt.data),
    allowEmpty: true,
    hint: "Leave blank to target all channels.",
  };

  let columns: string[] = [];
  let rows: Record<string, unknown>[] = [];
  let fields: DialogField[] = [];
  let upsert!: (fd: FormData) => Promise<void>;
  let remove!: (fd: FormData) => Promise<void>;
  let addLabel = "";
  // Create-mode defaults: prefill level/period and start capability flags unchecked.
  let createInitial: Record<string, string | boolean | null> = { level, period_month: period };

  if (tab === "sales") {
    addLabel = "Add Sales Target";
    upsert = upsertSalesTarget;
    remove = deleteSalesTarget;
    columns = ["Period", "Level", "Entity", "Channel", "Target (SAR)", "Qty", "Working days"];
    fields = [
      ...baseFields,
      channelField,
      { name: "target_amount", label: "Sales target (SAR)", type: "number", required: true, min: "0", step: "0.01" },
      { name: "target_qty", label: "Target qty (cartons)", type: "number", min: "0", step: "0.001" },
      { name: "working_days", label: "Working days", type: "number", min: "0", step: "1" },
    ];
    const { data } = await supabase
      .from("sla_target")
      .select(
        "id,period_month,level,target_amount,target_qty,working_days,region_id,area_id,agent_id,channel_id,region:region_id(name),area:area_id(name),agent:agent_id(name),channel:channel_id(name)",
      )
      .eq("period_month", periodDate)
      .eq("level", level)
      .order("created_at", { ascending: false });
    rows = (data as Record<string, unknown>[]) ?? [];
  } else if (tab === "coverage") {
    addLabel = "Add Coverage Target";
    upsert = upsertCoverageTarget;
    remove = deleteCoverageTarget;
    columns = ["Period", "Level", "Entity", "Channel", "Universe", "Active req", "Coverage %", "Productive %", "Visits"];
    fields = [
      ...baseFields,
      channelField,
      { name: "required_customer_universe", label: "Customer universe", type: "number", min: "0", step: "1" },
      { name: "required_active_customers", label: "Required active customers", type: "number", min: "0", step: "1" },
      { name: "required_coverage_pct", label: "Required coverage %", type: "number", min: "0", step: "0.01" },
      { name: "required_productive_pct", label: "Required productive %", type: "number", min: "0", step: "0.01" },
      { name: "required_visits", label: "Required visits", type: "number", min: "0", step: "1" },
    ];
    const { data } = await supabase
      .from("coverage_target")
      .select(
        "id,period_month,level,channel_id,required_customer_universe,required_active_customers,required_coverage_pct,required_productive_pct,required_visits,region_id,city_id,agent_id,region:region_id(name),city:city_id(name),agent:agent_id(name),channel:channel_id(name)",
      )
      .eq("period_month", periodDate)
      .eq("level", level)
      .order("created_at", { ascending: false });
    rows = (data as Record<string, unknown>[]) ?? [];
  } else {
    addLabel = "Add Capability Entry";
    upsert = upsertCapability;
    remove = deleteCapability;
    columns = ["Period", "Level", "Entity", "Salesmen (act/req)", "Warehouse", "Cash van", "Supervisor"];
    fields = [
      ...baseFields,
      { name: "required_salesmen", label: "Required salesmen", type: "number", min: "0", step: "1" },
      { name: "actual_salesmen", label: "Actual salesmen", type: "number", min: "0", step: "1" },
      { name: "warehouse_required", label: "Warehouse required", type: "checkbox" },
      { name: "warehouse_available", label: "Warehouse available", type: "checkbox" },
      { name: "cashvan_required", label: "Cash van required", type: "checkbox" },
      { name: "cashvan_available", label: "Cash van available", type: "checkbox" },
      { name: "supervisor_required", label: "Supervisor required", type: "checkbox" },
      { name: "supervisor_available", label: "Supervisor available", type: "checkbox" },
      { name: "notes", label: "Notes", type: "text" },
    ];
    createInitial = {
      ...createInitial,
      warehouse_required: false,
      warehouse_available: false,
      cashvan_required: false,
      cashvan_available: false,
      supervisor_required: false,
      supervisor_available: false,
    };
    const { data } = await supabase
      .from("capability_setup")
      .select(
        "id,period_month,level,required_salesmen,actual_salesmen,warehouse_required,warehouse_available,cashvan_required,cashvan_available,supervisor_required,supervisor_available,notes,region_id,city_id,agent_id,region:region_id(name),city:city_id(name),agent:agent_id(name)",
      )
      .eq("period_month", periodDate)
      .eq("level", level)
      .order("created_at", { ascending: false });
    rows = (data as Record<string, unknown>[]) ?? [];
  }

  function editInitial(r: Record<string, unknown>): Record<string, string | boolean | null> {
    const base: Record<string, string | boolean | null> = {
      id: String(r.id),
      level: String(r.level),
      period_month: fmtPeriod(r.period_month),
      [`${level}_id`]: (r[`${level}_id`] as string) ?? "",
    };
    if (tab === "sales") {
      return {
        ...base,
        channel_id: (r.channel_id as string) ?? "",
        target_amount: r.target_amount != null ? String(r.target_amount) : "",
        target_qty: r.target_qty != null ? String(r.target_qty) : "",
        working_days: r.working_days != null ? String(r.working_days) : "",
      };
    }
    if (tab === "coverage") {
      return {
        ...base,
        channel_id: (r.channel_id as string) ?? "",
        required_customer_universe: r.required_customer_universe != null ? String(r.required_customer_universe) : "",
        required_active_customers: r.required_active_customers != null ? String(r.required_active_customers) : "",
        required_coverage_pct: r.required_coverage_pct != null ? String(r.required_coverage_pct) : "",
        required_productive_pct: r.required_productive_pct != null ? String(r.required_productive_pct) : "",
        required_visits: r.required_visits != null ? String(r.required_visits) : "",
      };
    }
    return {
      ...base,
      required_salesmen: r.required_salesmen != null ? String(r.required_salesmen) : "",
      actual_salesmen: r.actual_salesmen != null ? String(r.actual_salesmen) : "",
      warehouse_required: Boolean(r.warehouse_required),
      warehouse_available: Boolean(r.warehouse_available),
      cashvan_required: Boolean(r.cashvan_required),
      cashvan_available: Boolean(r.cashvan_available),
      supervisor_required: Boolean(r.supervisor_required),
      supervisor_available: Boolean(r.supervisor_available),
      notes: (r.notes as string) ?? "",
    };
  }

  const qs = (over: Partial<{ tab: string; level: string; period: string }>) => {
    const p = new URLSearchParams({ tab, level, period, ...over });
    return `/app/targets?${p.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">SLA &amp; Coverage Setup</h1>
          <p className="text-sm text-muted">
            {isAdmin
              ? "Define monthly sales targets, coverage targets, and distributor capability."
              : "Review the monthly SLA & Coverage setup (read-only)."}
          </p>
        </div>
        {!isAdmin && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted">
            <Eye className="h-3.5 w-3.5" /> View only
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/app/targets?tab=${t.key}&period=${period}`}
            className={
              "rounded-t-lg px-4 py-2 text-sm font-medium " +
              (t.key === tab ? "border-b-2 border-burgundy text-burgundy" : "text-muted hover:text-burgundy")
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-muted">Level</span>
            <div className="inline-flex rounded-xl border border-line bg-white p-0.5">
              {levels.map((lv) => (
                <Link
                  key={lv}
                  href={qs({ level: lv })}
                  className={
                    "rounded-lg px-3 py-1.5 text-sm font-medium " +
                    (lv === level ? "bg-burgundy text-cream" : "text-muted hover:text-burgundy")
                  }
                >
                  {LEVEL_LABEL[lv]}
                </Link>
              ))}
            </div>
          </div>
          <form className="space-y-1" action="/app/targets" method="get">
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="level" value={level} />
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
        </div>
        {isAdmin && <EntityDialog title={addLabel} fields={fields} action={upsert} initial={createInitial} />}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-cream-deep/40 text-left text-xs uppercase tracking-wide text-muted">
              {columns.map((c) => (
                <th key={c} className="px-4 py-2.5 font-semibold">
                  {c}
                </th>
              ))}
              {isAdmin && <th className="px-4 py-2.5 text-right font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (isAdmin ? 1 : 0)} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium text-ink">
                    No entries for {LEVEL_LABEL[level]} · {period}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {isAdmin
                      ? "Add an entry, or switch the level / period above."
                      : "Nothing in your scope for this selection yet."}
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <td className="px-4 py-2.5 text-muted">{fmtPeriod(r.period_month)}</td>
                  <td className="px-4 py-2.5 capitalize text-muted">{txt(r.level)}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">{entityName(r)}</td>
                  {tab === "sales" && (
                    <>
                      <td className="px-4 py-2.5 text-muted">{rel(r.channel) === "—" ? "All channels" : rel(r.channel)}</td>
                      <td className="px-4 py-2.5 text-ink">{money(r.target_amount)}</td>
                      <td className="px-4 py-2.5 text-muted">{txt(r.target_qty)}</td>
                      <td className="px-4 py-2.5 text-muted">{txt(r.working_days)}</td>
                    </>
                  )}
                  {tab === "coverage" && (
                    <>
                      <td className="px-4 py-2.5 text-muted">{rel(r.channel) === "—" ? "All channels" : rel(r.channel)}</td>
                      <td className="px-4 py-2.5 text-muted">{txt(r.required_customer_universe)}</td>
                      <td className="px-4 py-2.5 text-muted">{txt(r.required_active_customers)}</td>
                      <td className="px-4 py-2.5 text-muted">
                        {r.required_coverage_pct != null ? `${r.required_coverage_pct}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {r.required_productive_pct != null ? `${r.required_productive_pct}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted">{txt(r.required_visits)}</td>
                    </>
                  )}
                  {tab === "capability" && (
                    <>
                      <td className="px-4 py-2.5 text-ink">
                        {txt(r.actual_salesmen)} / {txt(r.required_salesmen)}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {ok(r.warehouse_available)} / {ok(r.warehouse_required)}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {ok(r.cashvan_available)} / {ok(r.cashvan_required)}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {ok(r.supervisor_available)} / {ok(r.supervisor_required)}
                      </td>
                    </>
                  )}
                  {isAdmin && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <EntityDialog title={addLabel} mode="edit" fields={fields} action={upsert} initial={editInitial(r)} />
                        <ConfirmDelete action={remove} id={String(r.id)} />
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {tab === "capability" && (
        <p className="text-xs text-muted">
          Warehouse / Cash van / Supervisor show <strong>available / required</strong>.
        </p>
      )}
    </div>
  );
}
