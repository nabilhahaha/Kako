import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { AttachmentUploader, AttachmentRow } from "@/components/app/workspace/attachments";
import { RSTATUS_STYLE, money, expenseCatOpts } from "@/lib/req-meta";
import {
  addExpenseLine, deleteExpenseLine, submitRequest, decideRequest,
  addRequestAttachment, deleteRequestAttachment, requestReceiptSignedUrl, deleteRequest,
} from "@/lib/requests";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();

  const { data: req } = await supabase
    .from("request")
    .select("id,request_type,title,status,requested_by,assigned_approver,request_date,total_amount,currency,approval_comment,created_at")
    .eq("id", id)
    .maybeSingle();
  if (!req) notFound(); // not found OR not visible under RLS

  const [profilesRes, linesRes, attRes, actRes] = await Promise.all([
    supabase.from("profile").select("id,full_name,email"),
    supabase.from("expense_line").select("id,category,expense_date,amount,currency,description,merchant,vat_amount,payment_method,receipt_required").eq("request_id", id).order("created_at", { ascending: true }),
    supabase.from("request_attachment").select("id,expense_line_id,filename,storage_path,uploaded_by,created_at").eq("request_id", id).order("created_at", { ascending: true }),
    supabase.from("request_activity").select("id,actor_id,type,from_value,to_value,created_at").eq("request_id", id).order("created_at", { ascending: false }),
  ]);

  const nameById = new Map<string, string>();
  (profilesRes.data ?? []).forEach((p) => nameById.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
  const name = (x: unknown) => (x ? nameById.get(String(x)) ?? "—" : "—");

  const lines = linesRes.data ?? [];
  const attachments = attRes.data ?? [];
  const activity = actRes.data ?? [];
  const currency = (req.currency as string) ?? "SAR";
  const isDraft = req.status === "draft";
  const isOwner = req.requested_by === user.id;
  const isApprover = req.assigned_approver === user.id;
  const canEdit = isOwner && isDraft;
  const canDecide = isApprover && ["submitted", "pending_approval"].includes(String(req.status));

  const lineReceipts = (lineId: string) => attachments.filter((a) => a.expense_line_id === lineId);
  const total = lines.reduce((s, l) => s + Number(l.amount ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 ps-12 lg:ps-0">
      <Link href="/requests" className="inline-flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
        <ArrowLeft className="h-4 w-4" /> {t("req.back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{req.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (RSTATUS_STYLE[String(req.status)] ?? "")}>{t(`rstatus.${req.status}`)}</span>
            <span className="text-sm text-muted">{t(`rtype.${req.request_type}`)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <form action={submitRequest}>
              <input type="hidden" name="id" value={String(req.id)} />
              <button className="rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover disabled:opacity-60" disabled={lines.length === 0}>
                {t("req.submit")}
              </button>
            </form>
          )}
          {canEdit && (
            <form action={deleteRequest}>
              <input type="hidden" name="id" value={String(req.id)} />
              <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-roshen-red hover:bg-roshen-red/10">{t("common.delete")}</button>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Expense lines */}
          {req.request_type === "expense" && (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-base font-semibold text-ink">{t("req.lines")}</h2>
                <span className="text-sm font-semibold text-ink">{t("req.total")}: {money(total, currency)}</span>
              </div>

              <div className="mt-3 space-y-3">
                {lines.length === 0 ? (
                  <p className="text-sm text-muted">{t("req.no_lines")}</p>
                ) : (
                  lines.map((l) => {
                    const receipts = lineReceipts(l.id);
                    return (
                      <div key={l.id} className="rounded-xl border border-line bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-ink">{t(`ecat.${l.category}`)}</span>
                              <span className="text-sm text-burgundy">{money(l.amount, (l.currency as string) ?? currency)}</span>
                              {l.receipt_required && receipts.length === 0 && (
                                <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">{t("req.line.receipt")}</span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                              {l.expense_date && <span>{String(l.expense_date).slice(0, 10)}</span>}
                              {l.merchant && <span>{l.merchant}</span>}
                              {l.payment_method && <span>{l.payment_method}</span>}
                              {l.vat_amount != null && <span>{t("req.line.vat")}: {money(l.vat_amount, currency)}</span>}
                            </div>
                            {l.description && <p className="mt-1 text-sm text-ink/90">{l.description}</p>}
                          </div>
                          {canEdit && (
                            <form action={deleteExpenseLine}>
                              <input type="hidden" name="id" value={l.id} />
                              <input type="hidden" name="request_id" value={String(req.id)} />
                              <button className="rounded-lg p-1.5 text-muted hover:bg-roshen-red/10 hover:text-roshen-red" title={t("req.remove")}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </form>
                          )}
                        </div>

                        {/* Per-line receipts */}
                        <div className="mt-2 space-y-1.5">
                          {receipts.map((a) => (
                            <AttachmentRow
                              key={a.id}
                              id={a.id}
                              filename={a.filename}
                              path={a.storage_path}
                              canDelete={canEdit || a.uploaded_by === user.id}
                              signedUrl={requestReceiptSignedUrl}
                              remove={deleteRequestAttachment}
                              labels={{ download: t("common.download") }}
                            />
                          ))}
                          {canEdit && (
                            <AttachmentUploader
                              bucket="request-receipts"
                              pathPrefix={String(req.id)}
                              fields={{ request_id: String(req.id), expense_line_id: l.id }}
                              add={addRequestAttachment}
                              labels={{ upload: t("req.add_receipt"), uploading: t("task.uploading"), download: t("common.download"), none: t("req.receipts") }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add line */}
              {canEdit && (
                <form action={addExpenseLine} className="mt-4 grid gap-2 rounded-xl border border-dashed border-line bg-cream/30 p-3 sm:grid-cols-2">
                  <input type="hidden" name="request_id" value={String(req.id)} />
                  <label className="text-xs font-medium text-muted">
                    {t("req.line.category")}
                    <select name="category" defaultValue="other" className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm">
                      {expenseCatOpts(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-muted">
                    {t("req.line.amount")}
                    <input name="amount" type="number" step="0.01" min="0" required className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm" />
                  </label>
                  <label className="text-xs font-medium text-muted">
                    {t("req.line.date")}
                    <input name="expense_date" type="date" className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm" />
                  </label>
                  <label className="text-xs font-medium text-muted">
                    {t("req.line.merchant")}
                    <input name="merchant" className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm" />
                  </label>
                  <label className="text-xs font-medium text-muted">
                    {t("req.line.vat")}
                    <input name="vat_amount" type="number" step="0.01" min="0" className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm" />
                  </label>
                  <label className="text-xs font-medium text-muted">
                    {t("req.line.payment")}
                    <input name="payment_method" className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm" />
                  </label>
                  <label className="text-xs font-medium text-muted sm:col-span-2">
                    {t("req.line.description")}
                    <input name="description" className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm" />
                  </label>
                  <div className="sm:col-span-2">
                    <button className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">
                      <Plus className="h-4 w-4" /> {t("req.add_line")}
                    </button>
                  </div>
                </form>
              )}
              {canEdit && <p className="mt-2 text-xs text-muted">{t("req.draft_only_note")}</p>}
            </Card>
          )}

          {/* Approver decision */}
          {canDecide && (
            <Card className="p-5">
              <h2 className="font-serif text-base font-semibold text-ink">{t("req.approvals")}</h2>
              <form action={decideRequest} className="mt-3 space-y-3">
                <input type="hidden" name="id" value={String(req.id)} />
                <textarea name="comment" rows={2} placeholder={t("req.decision_comment")} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15" />
                <div className="flex flex-wrap gap-2">
                  <button name="action" value="approve" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">{t("req.approve")}</button>
                  <button name="action" value="reject" className="rounded-xl bg-roshen-red px-4 py-2 text-sm font-medium text-white hover:opacity-90">{t("req.reject")}</button>
                  <button name="action" value="return" className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-cream">{t("req.return")}</button>
                </div>
              </form>
            </Card>
          )}
        </div>

        {/* Summary + activity */}
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("req.summary")}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label={t("req.requester")} value={name(req.requested_by)} />
              <Row label={t("req.approver")} value={name(req.assigned_approver)} />
              <Row label={t("req.date")} value={String(req.request_date).slice(0, 10)} />
              <Row label={t("req.total")} value={money(req.total_amount ?? total, currency)} />
            </dl>
            {req.approval_comment && (
              <p className="mt-3 rounded-xl bg-cream/50 p-3 text-sm text-ink/90">“{req.approval_comment}”</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("req.activity")}</h2>
            <div className="mt-3 space-y-3">
              {activity.length === 0 ? (
                <p className="text-sm text-muted">{t("req.no_activity")}</p>
              ) : (
                activity.map((a) => (
                  <div key={a.id} className="text-sm">
                    <span className="font-medium text-ink">{name(a.actor_id)}</span>{" "}
                    <span className="text-muted">{String(a.type).replace(/_/g, " ")}</span>
                    <div className="text-xs text-muted">{new Date(a.created_at as string).toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
