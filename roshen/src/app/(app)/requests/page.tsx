import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { REQUEST_TYPES, RSTATUS_STYLE, typeOpts, money } from "@/lib/req-meta";
import { createExpenseDraft } from "@/lib/requests";
import { Plus } from "lucide-react";

const TABS = ["all", "mine", "approvals"] as const;
type Tab = (typeof TABS)[number];

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.includes(sp.tab as Tab) ? sp.tab : "all") as Tab;
  const typeF = (REQUEST_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as string) : "";

  const { user } = await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();

  let q = supabase
    .from("request")
    .select("id,title,request_type,status,requested_by,assigned_approver,request_date,total_amount,currency")
    .order("created_at", { ascending: false });
  if (tab === "mine") q = q.eq("requested_by", user.id);
  else if (tab === "approvals") q = q.eq("assigned_approver", user.id).in("status", ["submitted", "pending_approval"]);
  if (typeF) q = q.eq("request_type", typeF as never);

  const [reqRes, profilesRes] = await Promise.all([
    q,
    supabase.from("profile").select("id,full_name,email"),
  ]);
  const rows = reqRes.data ?? [];
  const nameById = new Map<string, string>();
  (profilesRes.data ?? []).forEach((p) => nameById.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
  const name = (id: unknown) => (id ? nameById.get(String(id)) ?? "—" : "—");

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ tab, type: typeF, ...over });
    if (!p.get("type")) p.delete("type");
    return `/requests?${p.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 ps-12 lg:ps-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("req.title")}</h1>
          <p className="text-sm text-muted">{t("req.subtitle")}</p>
        </div>
        <form action={createExpenseDraft}>
          <button className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">
            <Plus className="h-4 w-4" /> {t("req.new_expense")}
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((tk) => (
          <Link key={tk} href={qs({ tab: tk })}
            className={"rounded-t-lg px-4 py-2 text-sm font-medium " + (tk === tab ? "border-b-2 border-burgundy text-burgundy" : "text-muted hover:text-burgundy")}>
            {t(`req.tab.${tk}`)}
          </Link>
        ))}
      </div>

      <form action="/requests" method="get" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value={tab} />
        <select name="type" defaultValue={typeF} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <option value="">{t("req.filter.type")}: {t("common.all")}</option>
          {typeOpts(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="submit" className="rounded-xl bg-burgundy px-3 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">{t("common.apply_filters")}</button>
      </form>

      {rows.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-base font-semibold text-ink">{t("req.empty")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t("req.empty_hint")}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-cream-deep/40 text-start text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 text-start font-semibold">{t("req.col.title")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("req.col.type")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("req.col.requester")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("req.col.approver")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("req.col.amount")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("req.col.date")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("req.col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <td className="px-4 py-2.5 font-medium text-ink">
                    <Link href={`/requests/${r.id}`} className="hover:text-burgundy hover:underline">{r.title}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{t(`rtype.${r.request_type}`)}</td>
                  <td className="px-4 py-2.5 text-muted">{name(r.requested_by)}</td>
                  <td className="px-4 py-2.5 text-muted">{name(r.assigned_approver)}</td>
                  <td className="px-4 py-2.5 text-muted">{r.total_amount != null ? money(r.total_amount, r.currency ?? "SAR") : "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{String(r.request_date).slice(0, 10)}</td>
                  <td className="px-4 py-2.5"><span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (RSTATUS_STYLE[String(r.status)] ?? "")}>{t(`rstatus.${r.status}`)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
