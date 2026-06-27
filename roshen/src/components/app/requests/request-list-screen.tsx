import Link from "next/link";
import { Plus } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { RSTATUS_STYLE, money, statusReqOpts, leaveTypeOpts } from "@/lib/req-meta";
import { createExpenseDraft, createBusinessTripDraft, createLeaveDraft } from "@/lib/requests";

type Kind = "expense" | "business_trip" | "leave" | "approvals";

const rel = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v as T)) ?? null;

export async function RequestListScreen({
  kind,
  basePath,
  titleKey,
  subtitleKey,
  searchParams,
}: {
  kind: Kind;
  basePath: string;
  titleKey: string;
  subtitleKey: string;
  searchParams: Promise<{ status?: string; requester?: string; approver?: string; leave_type?: string }>;
}) {
  const sp = await searchParams;
  const { user } = await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();

  const detail =
    kind === "business_trip" ? ",business_trip_detail(traveler_name,from_city,to_city,start_date,end_date,total_estimated)"
      : kind === "leave" ? ",leave_detail(leave_type,start_date,end_date,cover_person_id)"
      : "";

  let q = supabase
    .from("request")
    .select(`id,title,request_type,status,requested_by,assigned_approver,request_date,total_amount,currency${detail}`)
    .order("created_at", { ascending: false });

  if (kind === "approvals") {
    q = q.eq("assigned_approver", user.id).in("status", ["submitted", "pending_approval"]);
  } else {
    q = q.eq("request_type", kind as never);
  }
  if (sp.status) q = q.eq("status", sp.status as never);
  if (sp.requester) q = q.eq("requested_by", sp.requester);
  if (sp.approver) q = q.eq("assigned_approver", sp.approver);

  const [reqRes, profilesRes] = await Promise.all([
    q,
    supabase.from("profile").select("id,full_name,email").order("full_name"),
  ]);
  let rows = (reqRes.data ?? []) as unknown as Record<string, unknown>[];
  if (kind === "leave" && sp.leave_type) {
    rows = rows.filter((r) => rel<{ leave_type?: string }>(r.leave_detail)?.leave_type === sp.leave_type);
  }

  const nameById = new Map<string, string>();
  (profilesRes.data ?? []).forEach((p) => nameById.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
  const name = (id: unknown) => (id ? nameById.get(String(id)) ?? "—" : "—");
  const people = (profilesRes.data ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email || p.id.slice(0, 8) }));

  const createAction = kind === "expense" ? createExpenseDraft : kind === "business_trip" ? createBusinessTripDraft : kind === "leave" ? createLeaveDraft : null;
  const createLabel = kind === "expense" ? t("req.new_expense") : kind === "business_trip" ? t("bt.new") : kind === "leave" ? t("lv.new") : "";

  const cols = columnsFor(kind, t);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 ps-12 lg:ps-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t(titleKey)}</h1>
          <p className="text-sm text-muted">{t(subtitleKey)}</p>
        </div>
        {createAction && (
          <form action={createAction}>
            <button className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">
              <Plus className="h-4 w-4" /> {createLabel}
            </button>
          </form>
        )}
      </div>

      {/* Filters */}
      <form action={basePath} method="get" className="flex flex-wrap items-end gap-2">
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <option value="">{t("req.status")}: {t("common.all")}</option>
          {statusReqOpts(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select name="requester" defaultValue={sp.requester ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <option value="">{t("req.filter.requester")}: {t("common.all")}</option>
          {people.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select name="approver" defaultValue={sp.approver ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <option value="">{t("req.filter.approver")}: {t("common.all")}</option>
          {people.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {kind === "leave" && (
          <select name="leave_type" defaultValue={sp.leave_type ?? ""} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
            <option value="">{t("req.filter.leave_type")}: {t("common.all")}</option>
            {leaveTypeOpts(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
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
                {cols.map((c) => <th key={c} className="px-4 py-2.5 text-start font-semibold">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <td className="px-4 py-2.5 font-medium text-ink">
                    <Link href={`/requests/${r.id}`} className="hover:text-burgundy hover:underline">{String(r.title)}</Link>
                  </td>
                  <Cells kind={kind} row={r} name={name} t={t} />
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

type TFn = (k: string, v?: Record<string, string | number>) => string;

function columnsFor(kind: Kind, t: TFn): string[] {
  if (kind === "business_trip") return [t("req.col.title"), t("bt.traveler"), t("req.col.route"), t("req.col.dates"), t("bt.total_est"), t("req.col.status")];
  if (kind === "leave") return [t("req.col.title"), t("req.requester"), t("lv.type"), t("req.col.dates"), t("lv.cover"), t("req.col.status")];
  if (kind === "approvals") return [t("req.col.title"), t("req.col.type"), t("req.col.requester"), t("req.col.amount"), t("req.col.date"), t("req.col.status")];
  return [t("req.col.title"), t("req.col.requester"), t("req.col.approver"), t("req.col.amount"), t("req.col.date"), t("req.col.status")];
}

function Cells({ kind, row, name, t }: { kind: Kind; row: Record<string, unknown>; name: (id: unknown) => string; t: TFn }) {
  const cur = (row.currency as string) ?? "SAR";
  const dateRange = (a?: string | null, b?: string | null) => (a || b ? `${a ? String(a).slice(0, 10) : "—"} → ${b ? String(b).slice(0, 10) : "—"}` : "—");
  if (kind === "business_trip") {
    const d = rel<{ traveler_name?: string; from_city?: string; to_city?: string; start_date?: string; end_date?: string; total_estimated?: number }>(row.business_trip_detail);
    return (
      <>
        <td className="px-4 py-2.5 text-muted">{d?.traveler_name || "—"}</td>
        <td className="px-4 py-2.5 text-muted">{d?.from_city || d?.to_city ? `${d?.from_city ?? "—"} → ${d?.to_city ?? "—"}` : "—"}</td>
        <td className="px-4 py-2.5 text-muted">{dateRange(d?.start_date, d?.end_date)}</td>
        <td className="px-4 py-2.5 text-muted">{d?.total_estimated != null ? money(d.total_estimated, cur) : "—"}</td>
      </>
    );
  }
  if (kind === "leave") {
    const d = rel<{ leave_type?: string; start_date?: string; end_date?: string; cover_person_id?: string }>(row.leave_detail);
    return (
      <>
        <td className="px-4 py-2.5 text-muted">{name(row.requested_by)}</td>
        <td className="px-4 py-2.5 text-muted">{d?.leave_type ? t(`ltype.${d.leave_type}`) : "—"}</td>
        <td className="px-4 py-2.5 text-muted">{dateRange(d?.start_date, d?.end_date)}</td>
        <td className="px-4 py-2.5 text-muted">{name(d?.cover_person_id)}</td>
      </>
    );
  }
  if (kind === "approvals") {
    return (
      <>
        <td className="px-4 py-2.5 text-muted">{t(`rtype.${row.request_type}`)}</td>
        <td className="px-4 py-2.5 text-muted">{name(row.requested_by)}</td>
        <td className="px-4 py-2.5 text-muted">{row.total_amount != null ? money(row.total_amount, cur) : "—"}</td>
        <td className="px-4 py-2.5 text-muted">{String(row.request_date).slice(0, 10)}</td>
      </>
    );
  }
  return (
    <>
      <td className="px-4 py-2.5 text-muted">{name(row.requested_by)}</td>
      <td className="px-4 py-2.5 text-muted">{name(row.assigned_approver)}</td>
      <td className="px-4 py-2.5 text-muted">{row.total_amount != null ? money(row.total_amount, cur) : "—"}</td>
      <td className="px-4 py-2.5 text-muted">{String(row.request_date).slice(0, 10)}</td>
    </>
  );
}
