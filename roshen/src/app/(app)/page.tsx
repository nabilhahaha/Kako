import Link from "next/link";
import {
  Wallet, Gauge, Radar, Users2, ListTodo, ClipboardList, AlertTriangle, CheckCircle2,
  Upload, Plus, BarChart3, UsersRound, Activity, ArrowRight, CalendarRange, type LucideIcon,
} from "lucide-react";
import { requireProfile, isGlobalRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/req-meta";
import { createExpenseDraft } from "@/lib/requests";

const rel = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v as T)) ?? null;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const daysAgoStr = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export default async function HomePage() {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();
  const isGlobal = isGlobalRole(profile!.role);
  const td = today();
  const ym = td.slice(0, 7);

  const [tasksR, reqsR, totalsR, lastImpR, scoreR, custR, apprR, actR, impR, covR, profilesR, scopeAllR, myScopeR] = await Promise.all([
    supabase.from("task").select("id,title,status,due_date"),
    supabase.from("request").select("id,status,assigned_approver,request_type"),
    supabase.from("import_batch_totals").select("sla_total"),
    supabase.from("import_batch").select("imported_at").eq("status", "imported").order("imported_at", { ascending: false }).limit(1),
    supabase.from("sla_scorecard").select("period_month,sla_score,actual_coverage_pct,sla_status"),
    supabase.from("customer").select("id", { count: "exact", head: true }),
    supabase.from("request_approval").select("action,actor_id,created_at,request:request_id(id,title)").order("created_at", { ascending: false }).limit(40),
    supabase.from("task_activity").select("actor_id,type,created_at,task:task_id(id,title)").order("created_at", { ascending: false }).limit(8),
    supabase.from("import_batch").select("id,source_filename,status,imported_at,created_at").order("created_at", { ascending: false }).limit(4),
    supabase.from("distributor_coverage").select("region:region_id(name)"),
    supabase.from("profile").select("id,full_name,email"),
    supabase.from("user_scope").select("user_id"),
    supabase.from("user_scope").select("area_id").eq("user_id", user.id),
  ]);

  const tasks = tasksR.data ?? [];
  const reqs = reqsR.data ?? [];
  const nameById = new Map<string, string>();
  (profilesR.data ?? []).forEach((p) => nameById.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));

  // KPIs
  const active = (r: { status?: unknown }) => r.status !== "completed" && r.status !== "cancelled";
  const openTasks = tasks.filter(active).length;
  const overdueTasks = tasks.filter((r) => active(r) && r.due_date && String(r.due_date) < td).length;
  const pendingReqs = reqs.filter((r) => ["submitted", "pending_approval"].includes(String(r.status))).length;
  const pendingApprovals = reqs.filter((r) => r.assigned_approver === user.id && ["submitted", "pending_approval"].includes(String(r.status))).length;
  const totalSales = (totalsR.data ?? []).reduce((s, r) => s + Number(r.sla_total ?? 0), 0);
  const lastImport = lastImpR.data?.[0]?.imported_at ? String(lastImpR.data[0].imported_at).slice(0, 10) : null;

  const score = scoreR.data ?? [];
  const maxMonth = score.reduce((m, r) => (String(r.period_month) > m ? String(r.period_month) : m), "");
  const latest = score.filter((r) => String(r.period_month) === maxMonth);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const slaScore = avg(latest.map((r) => Number(r.sla_score)).filter((n) => Number.isFinite(n)));
  const coveragePct = avg(latest.map((r) => Number(r.actual_coverage_pct)).filter((n) => Number.isFinite(n)));
  const slaBehind = latest.filter((r) => ["behind", "critical"].includes(String(r.sla_status))).length;
  const slaMix = new Map<string, number>();
  for (const r of latest) { const s = String(r.sla_status ?? "—"); slaMix.set(s, (slaMix.get(s) ?? 0) + 1); }

  const returnedMonth = (apprR.data ?? []).filter((a) => a.action === "return" && String(a.created_at).startsWith(ym)).length;
  const missingImport = !lastImport || lastImport < daysAgoStr(30);
  const usersWithout = isGlobal ? Math.max(0, (profilesR.data ?? []).length - new Set((scopeAllR.data ?? []).map((s) => s.user_id)).size) : 0;

  const covByRegion = new Map<string, number>();
  for (const c of covR.data ?? []) { const rn = rel<{ name?: string }>(c.region)?.name || "All Kingdom"; covByRegion.set(rn, (covByRegion.get(rn) ?? 0) + 1); }
  const covTop = [...covByRegion.entries()].sort((a, b) => b[1] - a[1]);
  const covMax = covTop.length ? covTop[0][1] : 1;

  const num = (v: number | null) => (v == null ? "—" : String(v));
  const kpis: { label: string; value: string; icon: LucideIcon; chip: string; soon?: boolean }[] = [
    { label: t("home2.total_sales"), value: totalSales > 0 ? money(totalSales, "SAR") : "—", icon: Wallet, chip: "bg-burgundy-soft text-burgundy", soon: totalSales === 0 },
    { label: t("home2.sla_score"), value: num(slaScore), icon: Gauge, chip: "bg-sky-50 text-sky-700", soon: slaScore == null },
    { label: t("home2.coverage"), value: coveragePct == null ? "—" : `${coveragePct}%`, icon: Radar, chip: "bg-emerald-50 text-emerald-700", soon: coveragePct == null },
    { label: t("home2.active_customers"), value: custR.count ? String(custR.count) : "—", icon: Users2, chip: "bg-gold-soft/50 text-chocolate", soon: !custR.count },
    { label: t("home2.open_tasks"), value: String(openTasks), icon: ListTodo, chip: "bg-burgundy-soft text-burgundy" },
    { label: t("home2.pending_requests"), value: String(pendingReqs), icon: ClipboardList, chip: "bg-sky-50 text-sky-700" },
    { label: t("home2.overdue_tasks"), value: String(overdueTasks), icon: AlertTriangle, chip: overdueTasks ? "bg-roshen-red/10 text-roshen-red" : "bg-cream-deep text-muted" },
    { label: t("home2.pending_approvals"), value: String(pendingApprovals), icon: CheckCircle2, chip: pendingApprovals ? "bg-amber-50 text-amber-700" : "bg-cream-deep text-muted" },
  ];

  const alerts: { label: string; count: number; href: string }[] = [
    { label: t("home2.a.overdue"), count: overdueTasks, href: "/workspace/my-tasks" },
    { label: t("home2.a.approvals"), count: pendingApprovals, href: "/requests/approvals" },
    { label: t("home2.a.sla_behind"), count: slaBehind, href: "/sla-report" },
    { label: t("home2.a.returned"), count: returnedMonth, href: "/requests" },
    { label: t("home2.a.users_no_scope"), count: usersWithout, href: "/users-scopes" },
  ].filter((a) => a.count > 0);
  if (missingImport && isGlobal) alerts.push({ label: t("home2.a.missing_import"), count: 1, href: "/raw-data-upload" });

  // Recent activity (merge tasks + approvals + imports)
  type Ev = { when: string; who: string; text: string; href: string };
  const evs: Ev[] = [];
  for (const a of actR.data ?? []) {
    const tk = rel<{ id?: string; title?: string }>(a.task);
    evs.push({ when: String(a.created_at), who: String(a.actor_id), text: `${String(a.type).replace(/_/g, " ")}${tk?.title ? " · " + tk.title : ""}`, href: tk?.id ? `/workspace/${tk.id}` : "/workspace" });
  }
  for (const a of (apprR.data ?? []).slice(0, 8)) {
    const rq = rel<{ id?: string; title?: string }>(a.request);
    evs.push({ when: String(a.created_at), who: String(a.actor_id), text: `${String(a.action).replace(/_/g, " ")}${rq?.title ? " · " + rq.title : ""}`, href: rq?.id ? `/requests/${rq.id}` : "/requests" });
  }
  for (const im of impR.data ?? []) {
    evs.push({ when: String(im.imported_at ?? im.created_at), who: "", text: `import · ${im.source_filename ?? ""} (${im.status})`, href: `/import-batches/${im.id}` });
  }
  evs.sort((a, b) => b.when.localeCompare(a.when));
  const recent = evs.slice(0, 8);
  const nm = (id: string) => (id ? nameById.get(id) ?? "—" : t("nav.import_batches"));

  const actions: { href?: string; action?: (fd: FormData) => Promise<void>; label: string; icon: LucideIcon; show: boolean }[] = [
    { href: "/raw-data-upload", label: t("nav.raw_data_upload"), icon: Upload, show: isGlobal },
    { href: "/workspace/my-tasks", label: t("home2.create_task"), icon: Plus, show: true },
    { action: createExpenseDraft, label: t("home2.create_expense"), icon: Plus, show: true },
    { href: "/sla-report", label: t("nav.sla_report"), icon: BarChart3, show: true },
    { href: "/users-scopes", label: t("nav.users_scopes"), icon: UsersRound, show: isGlobal },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 ps-12 lg:ps-0">
      {/* Hero */}
      <section className="brand-panel relative overflow-hidden rounded-2xl px-6 py-7 text-cream sm:px-9">
        <div className="relative z-10">
          <h1 className="font-serif text-3xl font-bold tracking-tight">{t("home2.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-cream/80">{t("home2.sub")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cream/15 px-3 py-1"><CalendarRange className="h-3.5 w-3.5" /> {t("home2.month")}: {ym}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cream/15 px-3 py-1"><Upload className="h-3.5 w-3.5" /> {t("home2.last_import")}: {lastImport ?? t("home2.no_import")}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cream/15 px-3 py-1">{isGlobal ? t("home2.scope_full") : t("home2.scope_assigned", { n: myScopeR.data?.length ?? 0 })}</span>
          </div>
        </div>
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-8 h-56 w-56 rounded-full border border-gold/15" />
      </section>

      {/* KPI cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4">
              <div className="flex items-start gap-3">
                <span className={"inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " + c.chip}><Icon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <p className="font-serif text-2xl font-bold leading-none text-ink">{c.value}</p>
                  <p className="mt-1 truncate text-sm font-medium text-muted">{c.label}</p>
                  {c.soon && <p className="text-[11px] text-muted/70">{t("home2.coming_soon")}</p>}
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sales / coverage summary */}
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("home2.sla_mix")}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {slaMix.size === 0 ? <p className="text-sm text-muted">{t("home2.coming_soon")}</p> : [...slaMix.entries()].map(([s, n]) => (
                <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-sm">
                  <span className="font-semibold text-ink">{n}</span><span className="capitalize text-muted">{s.replace(/_/g, " ")}</span>
                </span>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("home2.coverage_by_region")}</h2>
            <div className="mt-3 space-y-2">
              {covTop.length === 0 ? <p className="text-sm text-muted">—</p> : covTop.map(([rn, n]) => (
                <div key={rn}>
                  <div className="flex items-center justify-between text-sm"><span className="text-ink">{rn}</span><span className="text-muted">{n}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-cream-deep"><div className="h-1.5 rounded-full bg-burgundy" style={{ width: `${Math.round((100 * n) / covMax)}%` }} /></div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Needs attention + recent */}
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("home2.attention")}</h2>
            <div className="mt-3 space-y-2">
              {alerts.length === 0 ? <p className="text-sm text-muted">{t("home2.all_good")}</p> : alerts.map((a) => (
                <Link key={a.label} href={a.href} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 hover:bg-cream/40">
                  <span className="flex min-w-0 items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /><span className="truncate text-sm text-ink">{a.label}</span></span>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{a.count}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-base font-semibold text-ink">{t("home2.recent_activity")}</h2>
              <Link href="/notifications" className="text-xs font-medium text-burgundy hover:underline">{t("notif.view")}</Link>
            </div>
            <div className="mt-3 space-y-3">
              {recent.length === 0 ? <p className="text-sm text-muted">{t("task.no_activity")}</p> : recent.map((e, i) => (
                <Link key={i} href={e.href} className="flex gap-2.5">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cream-deep text-muted"><Activity className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 text-sm">
                    {e.who ? <span className="font-medium text-ink">{nm(e.who)} </span> : null}
                    <span className="text-muted">{e.text}</span>
                    <div className="text-[11px] text-muted">{new Date(e.when).toLocaleString()}</div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Quick actions */}
      <section>
        <h2 className="mb-3 font-serif text-base font-semibold text-ink">{t("home2.quick_actions")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {actions.filter((a) => a.show).map((a) => {
            const Icon = a.icon;
            const inner = (
              <>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-burgundy-soft text-burgundy"><Icon className="h-5 w-5" /></span>
                <span className="mt-3 block font-serif text-sm font-semibold text-ink">{a.label}</span>
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-burgundy">{t("org.manage")} <ArrowRight className="h-3 w-3" /></span>
              </>
            );
            const cls = "rounded-2xl border border-line bg-white p-5 text-start transition-shadow hover:shadow-md";
            return a.action
              ? <form key={a.label} action={a.action}><button className={cls + " w-full"}>{inner}</button></form>
              : <Link key={a.label} href={a.href!} className={cls + " block"}>{inner}</Link>;
          })}
        </div>
      </section>
    </div>
  );
}
