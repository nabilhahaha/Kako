import Link from "next/link";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { Eye } from "lucide-react";
import { TargetDialog } from "@/components/app/sla/target-dialog";
import { CoverageDialog, CapabilityDialog } from "@/components/app/sla/coverage-capability-dialogs";
import {
  upsertTarget, deleteTarget,
  upsertCoverageTarget, deleteCoverageTarget,
  upsertCapability, deleteCapability,
} from "@/lib/org";

const SAR = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) + " SAR";
const TABS = [
  { key: "sales", label: "Sales Targets" },
  { key: "coverage", label: "Coverage Targets" },
  { key: "capability", label: "Capability Setup" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const rel = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { name?: string } | null;
const yn = (b: unknown) => (b ? "Yes" : "No");

export default async function SlaSetupPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "sales") as TabKey;
  const { profile } = await requireProfile();
  const isAdmin = isAdminRole(profile!.role);
  const supabase = await createClient();

  const [regionsRes, distsRes, citiesRes, channelsRes] = await Promise.all([
    supabase.from("region").select("id,name").order("name"),
    supabase.from("agent").select("id,name,code").eq("type", "distributor").order("name"),
    supabase.from("city").select("id,name").order("name"),
    supabase.from("channel").select("id,name").eq("is_active", true).order("name"),
  ]);
  const opt = (rows: { id: string; name: string }[] | null) => (rows ?? []).map((r) => ({ value: r.id, label: r.name }));
  const regions = opt(regionsRes.data);
  const distributors = (distsRes.data ?? []).map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));
  const cities = opt(citiesRes.data);
  const channels = opt(channelsRes.data);
  const entityName = (level: string, r: Record<string, unknown>) =>
    rel(level === "region" ? r.region : level === "city" ? r.city : r.agent)?.name ?? "—";
  const entityId = (level: string, r: Record<string, unknown>) =>
    (level === "region" ? r.region_id : level === "city" ? r.city_id : r.agent_id) as string;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">SLA &amp; Coverage Setup</h1>
          <p className="text-sm text-muted">Sales targets, customer coverage plans, and service capability by Region / City / Distributor.</p>
        </div>
        {!isAdmin && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted">
            <Eye className="h-3.5 w-3.5" /> View only
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link key={t.key} href={`/sla-targets?tab=${t.key}`}
            className={"rounded-t-lg px-4 py-2 text-sm font-medium " + (t.key === tab ? "border-b-2 border-burgundy text-burgundy" : "text-muted hover:text-burgundy")}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "sales" && <SalesTab supabase={supabase} isAdmin={isAdmin} regions={regions} distributors={distributors} channels={channels} entityName={entityName} entityId={entityId} />}
      {tab === "coverage" && <CoverageTab supabase={supabase} isAdmin={isAdmin} regions={regions} distributors={distributors} cities={cities} channels={channels} entityName={entityName} entityId={entityId} />}
      {tab === "capability" && <CapabilityTab supabase={supabase} isAdmin={isAdmin} regions={regions} distributors={distributors} cities={cities} entityName={entityName} entityId={entityId} />}
    </div>
  );
}

type Opt = { value: string; label: string };
type SB = Awaited<ReturnType<typeof createClient>>;
type NameFn = (level: string, r: Record<string, unknown>) => string;
type IdFn = (level: string, r: Record<string, unknown>) => string;

async function SalesTab({ supabase, isAdmin, regions, distributors, channels, entityName, entityId }: { supabase: SB; isAdmin: boolean; regions: Opt[]; distributors: Opt[]; channels: Opt[]; entityName: NameFn; entityId: IdFn }) {
  const { data } = await supabase
    .from("sla_target")
    .select("id,period_month,level,target_amount,working_days,region_id,agent_id,channel_id,region:region_id(name),agent:agent_id(name),channel:channel_id(name)")
    .order("period_month", { ascending: false });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return (
    <>
      <div className="flex justify-end">{isAdmin && <TargetDialog distributors={distributors} regions={regions} channels={channels} action={upsertTarget} />}</div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line bg-cream-deep/40 text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2.5 font-semibold">Month</th><th className="px-4 py-2.5 font-semibold">Level</th><th className="px-4 py-2.5 font-semibold">Entity</th><th className="px-4 py-2.5 font-semibold">Channel</th><th className="px-4 py-2.5 text-right font-semibold">Target</th>{isAdmin && <th className="px-4 py-2.5 text-right font-semibold">Actions</th>}
          </tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center text-sm text-muted">No sales targets yet.</td></tr> :
              rows.map((t) => { const level = String(t.level); return (
                <tr key={String(t.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <td className="px-4 py-2.5 text-ink">{String(t.period_month).slice(0, 7)}</td>
                  <td className="px-4 py-2.5 capitalize text-muted">{level === "agent" ? "Distributor" : level}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">{entityName(level, t)}</td>
                  <td className="px-4 py-2.5 text-muted">{rel(t.channel)?.name ?? "All"}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-ink">{SAR(Number(t.target_amount ?? 0))}</td>
                  {isAdmin && <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-1">
                    <TargetDialog mode="edit" distributors={distributors} regions={regions} channels={channels} action={upsertTarget}
                      initial={{ id: String(t.id), period_month: String(t.period_month), level, entity_id: entityId(level, t), channel_id: (t.channel_id as string) ?? "", target_amount: String(t.target_amount ?? ""), working_days: t.working_days != null ? String(t.working_days) : "" }} />
                    <form action={deleteTarget}><input type="hidden" name="id" value={String(t.id)} /><button className="rounded-lg px-2 py-1 text-xs text-roshen-red hover:bg-roshen-red/10">Delete</button></form>
                  </div></td>}
                </tr>); })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

async function CoverageTab({ supabase, isAdmin, regions, distributors, cities, channels, entityName, entityId }: { supabase: SB; isAdmin: boolean; regions: Opt[]; distributors: Opt[]; cities: Opt[]; channels: Opt[]; entityName: NameFn; entityId: IdFn }) {
  const { data } = await supabase
    .from("coverage_target")
    .select("id,period_month,level,channel_id,region_id,city_id,agent_id,required_customer_universe,required_active_customers,required_coverage_pct,required_productive_pct,required_visits,region:region_id(name),city:city_id(name),agent:agent_id(name),channel:channel_id(name)")
    .order("period_month", { ascending: false });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return (
    <>
      <div className="flex justify-end">{isAdmin && <CoverageDialog distributors={distributors} regions={regions} cities={cities} channels={channels} action={upsertCoverageTarget} />}</div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line bg-cream-deep/40 text-left text-xs uppercase tracking-wide text-muted">
            {["Month","Level","Entity","Channel","Req. universe","Req. active","Req. cov %","Req. prod %"].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}{isAdmin && <th className="px-3 py-2.5 text-right font-semibold">Actions</th>}
          </tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={isAdmin ? 9 : 8} className="px-4 py-12 text-center text-sm text-muted">No coverage targets yet.</td></tr> :
              rows.map((t) => { const level = String(t.level); return (
                <tr key={String(t.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <td className="px-3 py-2.5 text-ink">{String(t.period_month).slice(0, 7)}</td>
                  <td className="px-3 py-2.5 capitalize text-muted">{level === "agent" ? "Distributor" : level}</td>
                  <td className="px-3 py-2.5 font-medium text-ink">{entityName(level, t)}</td>
                  <td className="px-3 py-2.5 text-muted">{rel(t.channel)?.name ?? "All"}</td>
                  <td className="px-3 py-2.5 text-muted">{String(t.required_customer_universe ?? "—")}</td>
                  <td className="px-3 py-2.5 text-muted">{String(t.required_active_customers ?? "—")}</td>
                  <td className="px-3 py-2.5 text-muted">{t.required_coverage_pct != null ? `${t.required_coverage_pct}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-muted">{t.required_productive_pct != null ? `${t.required_productive_pct}%` : "—"}</td>
                  {isAdmin && <td className="px-3 py-2.5"><div className="flex items-center justify-end gap-1">
                    <CoverageDialog mode="edit" distributors={distributors} regions={regions} cities={cities} channels={channels} action={upsertCoverageTarget}
                      initial={{ id: String(t.id), period_month: String(t.period_month), level, entity_id: entityId(level, t), channel_id: (t.channel_id as string) ?? "",
                        required_customer_universe: t.required_customer_universe != null ? String(t.required_customer_universe) : "",
                        required_active_customers: t.required_active_customers != null ? String(t.required_active_customers) : "",
                        required_coverage_pct: t.required_coverage_pct != null ? String(t.required_coverage_pct) : "",
                        required_productive_pct: t.required_productive_pct != null ? String(t.required_productive_pct) : "",
                        required_visits: t.required_visits != null ? String(t.required_visits) : "" }} />
                    <form action={deleteCoverageTarget}><input type="hidden" name="id" value={String(t.id)} /><button className="rounded-lg px-2 py-1 text-xs text-roshen-red hover:bg-roshen-red/10">Delete</button></form>
                  </div></td>}
                </tr>); })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

async function CapabilityTab({ supabase, isAdmin, regions, distributors, cities, entityName, entityId }: { supabase: SB; isAdmin: boolean; regions: Opt[]; distributors: Opt[]; cities: Opt[]; entityName: NameFn; entityId: IdFn }) {
  const { data } = await supabase
    .from("capability_setup")
    .select("id,period_month,level,region_id,city_id,agent_id,required_salesmen,actual_salesmen,warehouse_required,warehouse_available,cashvan_required,cashvan_available,supervisor_required,supervisor_available,notes,region:region_id(name),city:city_id(name),agent:agent_id(name)")
    .order("period_month", { ascending: false });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return (
    <>
      <div className="flex justify-end">{isAdmin && <CapabilityDialog distributors={distributors} regions={regions} cities={cities} action={upsertCapability} />}</div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line bg-cream-deep/40 text-left text-xs uppercase tracking-wide text-muted">
            {["Month","Level","Entity","Salesmen (act/req)","Warehouse","Cash Van","Supervisor"].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}{isAdmin && <th className="px-3 py-2.5 text-right font-semibold">Actions</th>}
          </tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center text-sm text-muted">No capability setup yet.</td></tr> :
              rows.map((t) => { const level = String(t.level); return (
                <tr key={String(t.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <td className="px-3 py-2.5 text-ink">{String(t.period_month).slice(0, 7)}</td>
                  <td className="px-3 py-2.5 capitalize text-muted">{level === "agent" ? "Distributor" : level}</td>
                  <td className="px-3 py-2.5 font-medium text-ink">{entityName(level, t)}</td>
                  <td className="px-3 py-2.5 text-muted">{String(t.actual_salesmen ?? "—")} / {String(t.required_salesmen ?? "—")}</td>
                  <td className="px-3 py-2.5 text-muted">{yn(t.warehouse_required)} / {yn(t.warehouse_available)}</td>
                  <td className="px-3 py-2.5 text-muted">{yn(t.cashvan_required)} / {yn(t.cashvan_available)}</td>
                  <td className="px-3 py-2.5 text-muted">{yn(t.supervisor_required)} / {yn(t.supervisor_available)}</td>
                  {isAdmin && <td className="px-3 py-2.5"><div className="flex items-center justify-end gap-1">
                    <CapabilityDialog mode="edit" distributors={distributors} regions={regions} cities={cities} action={upsertCapability}
                      initial={{ id: String(t.id), period_month: String(t.period_month), level, entity_id: entityId(level, t),
                        required_salesmen: t.required_salesmen != null ? String(t.required_salesmen) : "", actual_salesmen: t.actual_salesmen != null ? String(t.actual_salesmen) : "",
                        warehouse_required: Boolean(t.warehouse_required), warehouse_available: Boolean(t.warehouse_available),
                        cashvan_required: Boolean(t.cashvan_required), cashvan_available: Boolean(t.cashvan_available),
                        supervisor_required: Boolean(t.supervisor_required), supervisor_available: Boolean(t.supervisor_available), notes: (t.notes as string) ?? "" }} />
                    <form action={deleteCapability}><input type="hidden" name="id" value={String(t.id)} /><button className="rounded-lg px-2 py-1 text-xs text-roshen-red hover:bg-roshen-red/10">Delete</button></form>
                  </div></td>}
                </tr>); })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
