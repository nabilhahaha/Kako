import Link from "next/link";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { Eye } from "lucide-react";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
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

const lvlLabel = (t: TFn, level: string) =>
  level === "agent" ? t("level.distributor") : level === "region" ? t("level.region") : level === "city" ? t("level.city") : level;

export default async function SlaSetupPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "sales") as TabKey;
  const { profile } = await requireProfile();
  const isAdmin = isAdminRole(profile!.role);
  const supabase = await createClient();
  const { t } = await getT();

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
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("slaSetup.title")}</h1>
          <p className="text-sm text-muted">{t("slaSetup.desc")}</p>
        </div>
        {!isAdmin && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted">
            <Eye className="h-3.5 w-3.5" /> {t("common.view_only")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((tb) => (
          <Link key={tb.key} href={`/sla-targets?tab=${tb.key}`}
            className={"rounded-t-lg px-4 py-2 text-sm font-medium " + (tb.key === tab ? "border-b-2 border-burgundy text-burgundy" : "text-muted hover:text-burgundy")}>
            {t(`slaSetup.tab.${tb.key}`)}
          </Link>
        ))}
      </div>

      {tab === "sales" && <SalesTab t={t} supabase={supabase} isAdmin={isAdmin} regions={regions} distributors={distributors} channels={channels} entityName={entityName} entityId={entityId} />}
      {tab === "coverage" && <CoverageTab t={t} supabase={supabase} isAdmin={isAdmin} regions={regions} distributors={distributors} cities={cities} channels={channels} entityName={entityName} entityId={entityId} />}
      {tab === "capability" && <CapabilityTab t={t} supabase={supabase} isAdmin={isAdmin} regions={regions} distributors={distributors} cities={cities} entityName={entityName} entityId={entityId} />}
    </div>
  );
}

type Opt = { value: string; label: string };
type SB = Awaited<ReturnType<typeof createClient>>;
type NameFn = (level: string, r: Record<string, unknown>) => string;
type IdFn = (level: string, r: Record<string, unknown>) => string;

async function SalesTab({ t, supabase, isAdmin, regions, distributors, channels, entityName, entityId }: { t: TFn; supabase: SB; isAdmin: boolean; regions: Opt[]; distributors: Opt[]; channels: Opt[]; entityName: NameFn; entityId: IdFn }) {
  const { data } = await supabase
    .from("sla_target")
    .select("id,period_month,level,target_amount,working_days,region_id,agent_id,channel_id,region:region_id(name),agent:agent_id(name),channel:channel_id(name)")
    .order("period_month", { ascending: false });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return (
    <>
      <div className="flex justify-end">{isAdmin && <TargetDialog distributors={distributors} regions={regions} channels={channels} action={upsertTarget} addLabel={t("slaSetup.add.sales")} />}</div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line bg-cream-deep/40 text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2.5 font-semibold">{t("slaSetup.col.month")}</th><th className="px-4 py-2.5 font-semibold">{t("slaSetup.col.level")}</th><th className="px-4 py-2.5 font-semibold">{t("slaSetup.col.entity")}</th><th className="px-4 py-2.5 font-semibold">{t("slaSetup.col.channel")}</th><th className="px-4 py-2.5 text-right font-semibold">{t("slaSetup.col.target")}</th>{isAdmin && <th className="px-4 py-2.5 text-right font-semibold">{t("common.actions")}</th>}
          </tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center text-sm text-muted">{t("slaSetup.empty.sales")}</td></tr> :
              rows.map((tr) => { const level = String(tr.level); return (
                <tr key={String(tr.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <td className="px-4 py-2.5 text-ink">{String(tr.period_month).slice(0, 7)}</td>
                  <td className="px-4 py-2.5 text-muted">{lvlLabel(t, level)}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">{entityName(level, tr)}</td>
                  <td className="px-4 py-2.5 text-muted">{rel(tr.channel)?.name ?? t("common.all")}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-ink">{SAR(Number(tr.target_amount ?? 0))}</td>
                  {isAdmin && <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-1">
                    <TargetDialog mode="edit" distributors={distributors} regions={regions} channels={channels} action={upsertTarget}
                      initial={{ id: String(tr.id), period_month: String(tr.period_month), level, entity_id: entityId(level, tr), channel_id: (tr.channel_id as string) ?? "", target_amount: String(tr.target_amount ?? ""), working_days: tr.working_days != null ? String(tr.working_days) : "" }} />
                    <form action={deleteTarget}><input type="hidden" name="id" value={String(tr.id)} /><button className="rounded-lg px-2 py-1 text-xs text-roshen-red hover:bg-roshen-red/10">{t("common.delete")}</button></form>
                  </div></td>}
                </tr>); })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

async function CoverageTab({ t, supabase, isAdmin, regions, distributors, cities, channels, entityName, entityId }: { t: TFn; supabase: SB; isAdmin: boolean; regions: Opt[]; distributors: Opt[]; cities: Opt[]; channels: Opt[]; entityName: NameFn; entityId: IdFn }) {
  const { data } = await supabase
    .from("coverage_target")
    .select("id,period_month,level,channel_id,region_id,city_id,agent_id,required_customer_universe,required_active_customers,required_coverage_pct,required_productive_pct,required_visits,region:region_id(name),city:city_id(name),agent:agent_id(name),channel:channel_id(name)")
    .order("period_month", { ascending: false });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return (
    <>
      <div className="flex justify-end">{isAdmin && <CoverageDialog distributors={distributors} regions={regions} cities={cities} channels={channels} action={upsertCoverageTarget} addLabel={t("slaSetup.add.coverage")} />}</div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line bg-cream-deep/40 text-left text-xs uppercase tracking-wide text-muted">
            {[t("slaSetup.col.month"),t("slaSetup.col.level"),t("slaSetup.col.entity"),t("slaSetup.col.channel"),t("slaSetup.col.req_universe"),t("slaSetup.col.req_active"),t("slaSetup.col.req_cov"),t("slaSetup.col.req_prod")].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}{isAdmin && <th className="px-3 py-2.5 text-right font-semibold">{t("common.actions")}</th>}
          </tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={isAdmin ? 9 : 8} className="px-4 py-12 text-center text-sm text-muted">{t("slaSetup.empty.coverage")}</td></tr> :
              rows.map((tr) => { const level = String(tr.level); return (
                <tr key={String(tr.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <td className="px-3 py-2.5 text-ink">{String(tr.period_month).slice(0, 7)}</td>
                  <td className="px-3 py-2.5 text-muted">{lvlLabel(t, level)}</td>
                  <td className="px-3 py-2.5 font-medium text-ink">{entityName(level, tr)}</td>
                  <td className="px-3 py-2.5 text-muted">{rel(tr.channel)?.name ?? t("common.all")}</td>
                  <td className="px-3 py-2.5 text-muted">{String(tr.required_customer_universe ?? "—")}</td>
                  <td className="px-3 py-2.5 text-muted">{String(tr.required_active_customers ?? "—")}</td>
                  <td className="px-3 py-2.5 text-muted">{tr.required_coverage_pct != null ? `${tr.required_coverage_pct}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-muted">{tr.required_productive_pct != null ? `${tr.required_productive_pct}%` : "—"}</td>
                  {isAdmin && <td className="px-3 py-2.5"><div className="flex items-center justify-end gap-1">
                    <CoverageDialog mode="edit" distributors={distributors} regions={regions} cities={cities} channels={channels} action={upsertCoverageTarget}
                      initial={{ id: String(tr.id), period_month: String(tr.period_month), level, entity_id: entityId(level, tr), channel_id: (tr.channel_id as string) ?? "",
                        required_customer_universe: tr.required_customer_universe != null ? String(tr.required_customer_universe) : "",
                        required_active_customers: tr.required_active_customers != null ? String(tr.required_active_customers) : "",
                        required_coverage_pct: tr.required_coverage_pct != null ? String(tr.required_coverage_pct) : "",
                        required_productive_pct: tr.required_productive_pct != null ? String(tr.required_productive_pct) : "",
                        required_visits: tr.required_visits != null ? String(tr.required_visits) : "" }} />
                    <form action={deleteCoverageTarget}><input type="hidden" name="id" value={String(tr.id)} /><button className="rounded-lg px-2 py-1 text-xs text-roshen-red hover:bg-roshen-red/10">{t("common.delete")}</button></form>
                  </div></td>}
                </tr>); })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

async function CapabilityTab({ t, supabase, isAdmin, regions, distributors, cities, entityName, entityId }: { t: TFn; supabase: SB; isAdmin: boolean; regions: Opt[]; distributors: Opt[]; cities: Opt[]; entityName: NameFn; entityId: IdFn }) {
  const { data } = await supabase
    .from("capability_setup")
    .select("id,period_month,level,region_id,city_id,agent_id,required_salesmen,actual_salesmen,warehouse_required,warehouse_available,cashvan_required,cashvan_available,supervisor_required,supervisor_available,notes,region:region_id(name),city:city_id(name),agent:agent_id(name)")
    .order("period_month", { ascending: false });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const yn = (b: unknown) => (b ? t("common.yes") : t("common.no"));
  return (
    <>
      <div className="flex justify-end">{isAdmin && <CapabilityDialog distributors={distributors} regions={regions} cities={cities} action={upsertCapability} addLabel={t("slaSetup.add.capability")} />}</div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line bg-cream-deep/40 text-left text-xs uppercase tracking-wide text-muted">
            {[t("slaSetup.col.month"),t("slaSetup.col.level"),t("slaSetup.col.entity"),t("slaSetup.col.salesmen"),t("slaSetup.col.warehouse"),t("slaSetup.col.cashvan"),t("slaSetup.col.supervisor")].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}{isAdmin && <th className="px-3 py-2.5 text-right font-semibold">{t("common.actions")}</th>}
          </tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center text-sm text-muted">{t("slaSetup.empty.capability")}</td></tr> :
              rows.map((tr) => { const level = String(tr.level); return (
                <tr key={String(tr.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <td className="px-3 py-2.5 text-ink">{String(tr.period_month).slice(0, 7)}</td>
                  <td className="px-3 py-2.5 text-muted">{lvlLabel(t, level)}</td>
                  <td className="px-3 py-2.5 font-medium text-ink">{entityName(level, tr)}</td>
                  <td className="px-3 py-2.5 text-muted">{String(tr.actual_salesmen ?? "—")} / {String(tr.required_salesmen ?? "—")}</td>
                  <td className="px-3 py-2.5 text-muted">{yn(tr.warehouse_required)} / {yn(tr.warehouse_available)}</td>
                  <td className="px-3 py-2.5 text-muted">{yn(tr.cashvan_required)} / {yn(tr.cashvan_available)}</td>
                  <td className="px-3 py-2.5 text-muted">{yn(tr.supervisor_required)} / {yn(tr.supervisor_available)}</td>
                  {isAdmin && <td className="px-3 py-2.5"><div className="flex items-center justify-end gap-1">
                    <CapabilityDialog mode="edit" distributors={distributors} regions={regions} cities={cities} action={upsertCapability}
                      initial={{ id: String(tr.id), period_month: String(tr.period_month), level, entity_id: entityId(level, tr),
                        required_salesmen: tr.required_salesmen != null ? String(tr.required_salesmen) : "", actual_salesmen: tr.actual_salesmen != null ? String(tr.actual_salesmen) : "",
                        warehouse_required: Boolean(tr.warehouse_required), warehouse_available: Boolean(tr.warehouse_available),
                        cashvan_required: Boolean(tr.cashvan_required), cashvan_available: Boolean(tr.cashvan_available),
                        supervisor_required: Boolean(tr.supervisor_required), supervisor_available: Boolean(tr.supervisor_available), notes: (tr.notes as string) ?? "" }} />
                    <form action={deleteCapability}><input type="hidden" name="id" value={String(tr.id)} /><button className="rounded-lg px-2 py-1 text-xs text-roshen-red hover:bg-roshen-red/10">{t("common.delete")}</button></form>
                  </div></td>}
                </tr>); })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
