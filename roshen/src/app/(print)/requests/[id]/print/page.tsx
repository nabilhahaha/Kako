import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { RSTATUS_STYLE, money } from "@/lib/req-meta";
import { PrintButton } from "@/components/app/requests/print-button";

export default async function RequestPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();

  const { data: req } = await supabase
    .from("request")
    .select("id,request_type,title,status,requested_by,assigned_approver,request_date,total_amount,currency,approval_comment,created_at,submitted_at,decided_at")
    .eq("id", id)
    .maybeSingle();
  if (!req) notFound();

  const [profilesRes, linesRes, attRes, apprRes, btRes, lvRes] = await Promise.all([
    supabase.from("profile").select("id,full_name,email"),
    supabase.from("expense_line").select("id,category,expense_date,amount,currency,description,merchant,vat_amount,payment_method").eq("request_id", id).order("created_at", { ascending: true }),
    supabase.from("request_attachment").select("id,filename,expense_line_id,created_at").eq("request_id", id).order("created_at", { ascending: true }),
    supabase.from("request_approval").select("id,actor_id,action,from_status,to_status,comment,created_at").eq("request_id", id).order("created_at", { ascending: true }),
    req.request_type === "business_trip" ? supabase.from("business_trip_detail").select("*").eq("request_id", id).maybeSingle() : Promise.resolve({ data: null }),
    req.request_type === "leave" ? supabase.from("leave_detail").select("*").eq("request_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const nameById = new Map<string, string>();
  (profilesRes.data ?? []).forEach((p) => nameById.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
  const name = (x: unknown) => (x ? nameById.get(String(x)) ?? "—" : "—");

  const lines = linesRes.data ?? [];
  const attachments = attRes.data ?? [];
  const approvals = apprRes.data ?? [];
  const bt = btRes.data as Record<string, unknown> | null;
  const lv = lvRes.data as Record<string, unknown> | null;
  const currency = (req.currency as string) ?? "SAR";
  const total = req.total_amount ?? lines.reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const isDraft = req.status === "draft";

  return (
    <div className="relative mx-auto max-w-[210mm] px-8 py-8 print:px-0 print:py-0">
      {isDraft && (
        <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center">
          <span className="rotate-[-30deg] text-[120px] font-black tracking-widest text-roshen-red/10 select-none">{t("print.draft")}</span>
        </div>
      )}

      <div className="relative z-10">
        <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
          <Link href={`/requests/${req.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
            <ArrowLeft className="h-4 w-4" /> {t("req.back")}
          </Link>
          <PrintButton label={t("print.do_print")} />
        </div>

        {/* Header */}
        <div className="border-b-2 border-burgundy pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-serif text-lg font-bold text-burgundy">{t("app.name")}</p>
              <h1 className="mt-1 font-serif text-2xl font-bold text-ink">{req.title}</h1>
              <p className="mt-1 text-sm text-muted">{t(`rtype.${req.request_type}`)}</p>
            </div>
            <div className="text-end">
              <span className={"inline-flex rounded-full px-3 py-1 text-xs font-semibold " + (RSTATUS_STYLE[String(req.status)] ?? "")}>{t(`rstatus.${req.status}`)}</span>
              <p className="mt-2 text-xs text-muted">{t("print.generated")}: {new Date().toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Summary */}
        <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row label={t("req.requester")} value={name(req.requested_by)} />
          <Row label={t("req.approver")} value={name(req.assigned_approver)} />
          <Row label={t("req.date")} value={String(req.request_date).slice(0, 10)} />
          <Row label={t("req.total")} value={money(total, currency)} />
        </section>

        {/* Expense lines */}
        {req.request_type === "expense" && (
          <section className="mt-6">
            <h2 className="font-serif text-base font-semibold text-ink">{t("req.lines")}</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-start text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 text-start font-semibold">{t("req.line.category")}</th>
                  <th className="py-2 text-start font-semibold">{t("req.line.date")}</th>
                  <th className="py-2 text-start font-semibold">{t("req.line.merchant")}</th>
                  <th className="py-2 text-start font-semibold">{t("req.line.payment")}</th>
                  <th className="py-2 text-end font-semibold">{t("req.line.vat")}</th>
                  <th className="py-2 text-end font-semibold">{t("req.line.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-line/60">
                    <td className="py-2">{t(`ecat.${l.category}`)}{l.description ? <span className="block text-xs text-muted">{l.description}</span> : null}</td>
                    <td className="py-2 text-muted">{l.expense_date ? String(l.expense_date).slice(0, 10) : "—"}</td>
                    <td className="py-2 text-muted">{l.merchant ?? "—"}</td>
                    <td className="py-2 text-muted">{l.payment_method ?? "—"}</td>
                    <td className="py-2 text-end text-muted">{l.vat_amount != null ? money(l.vat_amount, currency) : "—"}</td>
                    <td className="py-2 text-end font-medium">{money(l.amount, (l.currency as string) ?? currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-burgundy">
                  <td colSpan={5} className="py-2 text-end font-semibold">{t("req.total")}</td>
                  <td className="py-2 text-end font-bold text-burgundy">{money(total, currency)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {/* Business trip detail */}
        {req.request_type === "business_trip" && bt && (
          <section className="mt-6">
            <h2 className="font-serif text-base font-semibold text-ink">{t("bt.details")}</h2>
            <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <Row label={t("bt.traveler")} value={String(bt.traveler_name ?? "—")} />
              <Row label={t("bt.country")} value={String(bt.country ?? "—")} />
              <Row label={t("bt.from_city")} value={String(bt.from_city ?? "—")} />
              <Row label={t("bt.to_city")} value={String(bt.to_city ?? "—")} />
              <Row label={t("bt.start")} value={bt.start_date ? String(bt.start_date).slice(0, 10) : "—"} />
              <Row label={t("bt.end")} value={bt.end_date ? String(bt.end_date).slice(0, 10) : "—"} />
              <Row label={t("bt.days")} value={String(bt.num_days ?? "—")} />
              <Row label={t("bt.travel_type")} value={bt.travel_type ? t(`ttype.${bt.travel_type}`) : "—"} />
              <Row label={t("bt.transport")} value={bt.transportation_type ? t(`ttran.${bt.transportation_type}`) : "—"} />
              <Row label={t("bt.total_est")} value={money(bt.total_estimated ?? 0, currency)} />
              {bt.purpose ? <Row label={t("bt.purpose")} value={String(bt.purpose)} /> : null}
              {bt.justification ? <Row label={t("bt.justification")} value={String(bt.justification)} /> : null}
            </div>
          </section>
        )}

        {/* Leave detail */}
        {req.request_type === "leave" && lv && (
          <section className="mt-6">
            <h2 className="font-serif text-base font-semibold text-ink">{t("lv.details")}</h2>
            <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <Row label={t("lv.type")} value={lv.leave_type ? t(`ltype.${lv.leave_type}`) : "—"} />
              <Row label={t("lv.cover")} value={name(lv.cover_person_id)} />
              <Row label={t("lv.start")} value={lv.start_date ? String(lv.start_date).slice(0, 10) : "—"} />
              <Row label={t("lv.end")} value={lv.end_date ? String(lv.end_date).slice(0, 10) : "—"} />
              <Row label={t("lv.days")} value={String(lv.num_days ?? "—")} />
              {lv.reason ? <Row label={t("lv.reason")} value={String(lv.reason)} /> : null}
            </div>
          </section>
        )}

        {/* Attachments list */}
        <section className="mt-6">
          <h2 className="font-serif text-base font-semibold text-ink">{t("print.attachments")}</h2>
          {attachments.length === 0 ? (
            <p className="mt-1 text-sm text-muted">—</p>
          ) : (
            <ul className="mt-2 list-disc ps-5 text-sm text-ink/90">
              {attachments.map((a) => <li key={a.id}>{a.filename}</li>)}
            </ul>
          )}
        </section>

        {/* Approval history */}
        <section className="mt-6">
          <h2 className="font-serif text-base font-semibold text-ink">{t("print.approval_history")}</h2>
          {approvals.length === 0 ? (
            <p className="mt-1 text-sm text-muted">{t("print.no_history")}</p>
          ) : (
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-start text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 text-start font-semibold">{t("print.action")}</th>
                  <th className="py-2 text-start font-semibold">{t("print.actor")}</th>
                  <th className="py-2 text-start font-semibold">{t("print.when")}</th>
                  <th className="py-2 text-start font-semibold">{t("print.comment")}</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((a) => (
                  <tr key={a.id} className="border-b border-line/60">
                    <td className="py-2 capitalize">{String(a.action).replace(/_/g, " ")}</td>
                    <td className="py-2 text-muted">{name(a.actor_id)}</td>
                    <td className="py-2 text-muted">{new Date(a.created_at as string).toLocaleString()}</td>
                    <td className="py-2 text-muted">{a.comment ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {req.approval_comment && (
          <p className="mt-4 border-s-2 border-burgundy ps-3 text-sm text-ink/90">“{req.approval_comment}”</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/40 py-1">
      <span className="text-muted">{label}</span>
      <span className="text-end font-medium text-ink">{value}</span>
    </div>
  );
}
