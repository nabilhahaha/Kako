import Link from "next/link";
import { Plus, ClipboardList, Clock, CheckCircle2, XCircle, Wallet, type LucideIcon } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { RSTATUS_STYLE, money } from "@/lib/req-meta";
import { createExpenseDraft, createBusinessTripDraft, createLeaveDraft } from "@/lib/requests";

function monthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function RequestsOverviewPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();
  const ym = monthStr();

  const [reqRes, apprRes, profilesRes] = await Promise.all([
    supabase.from("request").select("id,title,request_type,status,requested_by,assigned_approver,request_date,total_amount,currency,decided_at,created_at").order("created_at", { ascending: false }),
    supabase.from("request_approval").select("id,action,actor_id,created_at,request:request_id(id,title)").order("created_at", { ascending: false }).limit(40),
    supabase.from("profile").select("id,full_name,email"),
  ]);
  const reqs = (reqRes.data ?? []) as Record<string, unknown>[];
  const apprs = (apprRes.data ?? []) as Record<string, unknown>[];
  const nameById = new Map<string, string>();
  (profilesRes.data ?? []).forEach((p) => nameById.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
  const name = (id: unknown) => (id ? nameById.get(String(id)) ?? "—" : "—");

  const total = reqs.length;
  const pending = reqs.filter((r) => r.assigned_approver === user.id && ["submitted", "pending_approval"].includes(String(r.status))).length;
  const inMonth = (d: unknown) => d && String(d).startsWith(ym);
  const approvedMonth = apprs.filter((a) => a.action === "approve" && inMonth(a.created_at)).length;
  const rejectedReturned = apprs.filter((a) => ["reject", "return"].includes(String(a.action)) && inMonth(a.created_at)).length;
  const expenseMonth = reqs
    .filter((r) => r.request_type === "expense" && inMonth(r.request_date))
    .reduce((s, r) => s + Number(r.total_amount ?? 0), 0);

  const cards: { label: string; value: string; icon: LucideIcon; chip: string }[] = [
    { label: t("req.sum.total"), value: String(total), icon: ClipboardList, chip: "bg-burgundy-soft text-burgundy" },
    { label: t("req.sum.pending"), value: String(pending), icon: Clock, chip: "bg-amber-50 text-amber-700" },
    { label: t("req.sum.approved_month"), value: String(approvedMonth), icon: CheckCircle2, chip: "bg-emerald-50 text-emerald-700" },
    { label: t("req.sum.rejected"), value: String(rejectedReturned), icon: XCircle, chip: "bg-roshen-red/10 text-roshen-red" },
    { label: t("req.sum.expense_month"), value: money(expenseMonth, "SAR"), icon: Wallet, chip: "bg-gold-soft/50 text-chocolate" },
  ];

  const recent = reqs.slice(0, 6);
  const recentActivity = apprs.slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 ps-12 lg:ps-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("nav.req_overview")}</h1>
          <p className="text-sm text-muted">{t("req.overview_sub")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={createExpenseDraft}>
            <button className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover"><Plus className="h-4 w-4" /> {t("req.new_expense")}</button>
          </form>
          <form action={createBusinessTripDraft}>
            <button className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-burgundy hover:bg-burgundy-soft"><Plus className="h-4 w-4" /> {t("bt.new")}</button>
          </form>
          <form action={createLeaveDraft}>
            <button className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-burgundy hover:bg-burgundy-soft"><Plus className="h-4 w-4" /> {t("lv.new")}</button>
          </form>
        </div>
      </div>

      {/* Summary cards */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4">
              <div className="flex items-start gap-3">
                <span className={"inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " + c.chip}><Icon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <p className="font-serif text-2xl font-bold leading-none text-ink">{c.value}</p>
                  <p className="mt-1 text-sm font-medium text-muted">{c.label}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent requests */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-base font-semibold text-ink">{t("req.recent")}</h2>
            <Link href="/requests/expenses" className="text-xs font-medium text-burgundy hover:underline">{t("nav.expenses")}</Link>
          </div>
          <div className="mt-3 space-y-2">
            {recent.length === 0 ? <p className="text-sm text-muted">{t("req.empty")}</p> : recent.map((r) => (
              <Link key={String(r.id)} href={`/requests/${r.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 hover:bg-cream/40">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{String(r.title)}</span>
                  <span className="text-xs text-muted">{t(`rtype.${r.request_type}`)} · {name(r.requested_by)}</span>
                </span>
                <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium " + (RSTATUS_STYLE[String(r.status)] ?? "")}>{t(`rstatus.${r.status}`)}</span>
              </Link>
            ))}
          </div>
        </Card>

        {/* Recent approval activity */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-base font-semibold text-ink">{t("req.recent_activity")}</h2>
            <Link href="/requests/approvals" className="text-xs font-medium text-burgundy hover:underline">{t("nav.approvals")}</Link>
          </div>
          <div className="mt-3 space-y-3">
            {recentActivity.length === 0 ? <p className="text-sm text-muted">{t("req.no_activity")}</p> : recentActivity.map((a) => {
              const rq = (Array.isArray(a.request) ? a.request[0] : a.request) as { id?: string; title?: string } | null;
              return (
                <div key={String(a.id)} className="text-sm">
                  <span className="font-medium text-ink">{name(a.actor_id)}</span>{" "}
                  <span className="text-muted">{String(a.action).replace(/_/g, " ")}</span>
                  {rq?.title ? <Link href={`/requests/${rq.id}`} className="text-burgundy hover:underline"> · {rq.title}</Link> : null}
                  <div className="text-[11px] text-muted">{new Date(a.created_at as string).toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
