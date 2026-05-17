// ⚠️  STALE since v3.5 — the submissions table no longer exists.
// Email is currently disabled in the UI (PDF download replaces it).
// If you re-enable email, rewrite this function to query
//   public.visits + public.visit_items  instead of  public.submissions.
//
// POST { submission_id, is_edit, lang }
// Builds the decision/edit email from the DB row and sends it via Resend.
//
// Required env (set via `supabase secrets set`):
//   RESEND_API_KEY    — Resend API key
//   FROM_EMAIL        — verified Resend "from" address, e.g. "Roshen KSA <decisions@your-domain.com>"
//   TM_EMAIL          — Trade Marketing recipient (default; overridable by submission.tm.email)

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { adminClient, requireAuthed } from '../_shared/auth.ts';

const ACTION_LABELS: Record<string, { ar: string; en: string }> = {
  promo_1_1:   { ar: 'عرض 1+1', en: '1+1 Promotion' },
  promo_2_1:   { ar: 'عرض 2+1', en: '2+1 Promotion' },
  pull_resell: { ar: 'سحب البضاعة وإعادة بيعها', en: 'Pull stock and resell' },
  no_action:   { ar: 'لا يوجد إجراء', en: 'No action' },
};

const fmtDate = (iso: string | null | undefined, lang: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'ar-EG', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
};

const buildSubject = (s: any, isEdit: boolean, lang: string) => {
  const fin = ACTION_LABELS[s.rm_decision] ?? { ar: '', en: '' };
  if (isEdit) {
    const history = (s.edit_history as any[]) || [];
    const last = history[history.length - 1];
    const old = last ? ACTION_LABELS[last.previousAction] ?? { ar: '', en: '' } : { ar: '', en: '' };
    return lang === 'en'
      ? `[Roshen KSA] ⚠️ DECISION UPDATED — was ${old.en}, now ${fin.en} — ${s.item_id}`
      : `[Roshen KSA] ⚠️ تعديل قرار سابق — تغيير من ${old.ar} إلى ${fin.ar} — ${s.item_id}`;
  }
  return lang === 'en'
    ? `[Roshen KSA] Final decision — ${fin.en} — ${s.item_id} — ${s.cust_name}`
    : `[Roshen KSA] قرار نهائي — ${fin.ar} — ${s.item_id} — ${s.cust_name}`;
};

const buildHtml = (s: any, isEdit: boolean, _lang: string) => {
  const fin = ACTION_LABELS[s.rm_decision] ?? { ar: '', en: '' };
  const tm = ACTION_LABELS[s.tm_decision] ?? { ar: '', en: '' };
  const sg = ACTION_LABELS[s.salesman_suggestion] ?? { ar: '', en: '' };

  let oldBlock = '';
  if (isEdit) {
    const history = (s.edit_history as any[]) || [];
    const last = history[history.length - 1];
    const old = last ? ACTION_LABELS[last.previousAction] ?? { ar: '', en: '' } : { ar: '', en: '' };
    oldBlock = `
      <div style="background:#fef3c7;border-right:4px solid #d97706;padding:14px;margin-bottom:18px;border-radius:8px">
        <p style="margin:0;font-size:13px;color:#78350f;font-weight:600">⚠️ تنبيه: تم تعديل القرار السابق / Decision was updated</p>
        <p style="margin:6px 0 0;font-size:13px;color:#92400e">القرار السابق: <s>${old.ar}</s> ← الحالي: <strong>${fin.ar}</strong></p>
        <p style="margin:4px 0 0;font-size:13px;color:#92400e">Previous: <s>${old.en}</s> → Current: <strong>${fin.en}</strong></p>
      </div>`;
  }

  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#f9fafb;padding:20px">
    <div style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:linear-gradient(135deg,#dc2626 0%,#991b1b 100%);padding:24px;text-align:center">
        <p style="color:rgba(255,255,255,0.85);margin:0;font-size:11px;letter-spacing:2px">ROSHEN KSA × RELIA DISTRIBUTION</p>
        <h1 style="color:#ffffff;margin:6px 0 0;font-size:20px;font-weight:600">
          ${isEdit ? '⚠️ تعديل قرار — Decision Updated' : '🏷️ قرار نهائي — Final Decision'}
        </h1>
        <p style="color:rgba(255,255,255,0.9);margin:4px 0 0;font-size:13px">نظام تسجيل الأصناف قريبة الانتهاء / Near Expiry System</p>
      </div>
      <div style="padding:24px" dir="rtl">
        <div style="background:#dcfce7;border-radius:12px;padding:18px;text-align:center;margin-bottom:20px;border:1px solid #86efac">
          <p style="margin:0;font-size:11px;color:#166534;letter-spacing:1px">FINAL DECISION / القرار النهائي</p>
          <p style="margin:8px 0 0;font-size:22px;font-weight:700;color:#14532d">✅ ${fin.ar}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#166534">${fin.en}</p>
        </div>
        ${oldBlock}
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:16px">
          <p style="margin:0 0 10px;font-size:11px;color:#6b7280;letter-spacing:1px">بيانات الصنف والعميل / ITEM &amp; CUSTOMER</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr><td style="padding:6px 0;color:#6b7280">المندوب / Salesman</td><td style="padding:6px 0;font-weight:600;text-align:left">${s.salesman_name}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;border-top:1px solid #f3f4f6">العميل / Customer</td><td style="padding:6px 0;font-weight:600;text-align:left;border-top:1px solid #f3f4f6">${s.cust_name} (${s.cust_account})</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;border-top:1px solid #f3f4f6">الصنف / Item</td><td style="padding:6px 0;font-weight:600;text-align:left;border-top:1px solid #f3f4f6">${s.item_desc}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;border-top:1px solid #f3f4f6">كود / SKU</td><td style="padding:6px 0;font-weight:600;text-align:left;border-top:1px solid #f3f4f6">${s.item_id}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;border-top:1px solid #f3f4f6">كمية السيستم / System qty</td><td style="padding:6px 0;font-weight:600;text-align:left;border-top:1px solid #f3f4f6">${s.net_qty} cases</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;border-top:1px solid #f3f4f6">الكمية الفعلية / Physical qty</td><td style="padding:6px 0;font-weight:600;text-align:left;border-top:1px solid #f3f4f6">${s.phys_qty} cases</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;border-top:1px solid #f3f4f6">تاريخ الانتهاء / Expiry</td><td style="padding:6px 0;font-weight:600;text-align:left;border-top:1px solid #f3f4f6">${s.expiry_date}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;border-top:1px solid #f3f4f6">الأيام المتبقية / Days left</td><td style="padding:6px 0;font-weight:700;color:#dc2626;text-align:left;border-top:1px solid #f3f4f6">${s.days_remaining} days</td></tr>
          </table>
        </div>
        <div style="background:#eff6ff;border-radius:10px;padding:14px;margin-bottom:12px;border-right:3px solid #2563eb">
          <p style="margin:0;font-size:11px;color:#1e40af;letter-spacing:1px">🟦 SALESMAN SUGGESTION (advisory) / اقتراح المندوب</p>
          <p style="margin:6px 0 0;font-size:14px;color:#1e3a8a;font-weight:600">${sg.ar} — ${sg.en}</p>
          ${s.salesman_notes ? `<p style="margin:4px 0 0;font-size:12px;color:#1e40af;line-height:1.6">📝 ${s.salesman_notes}</p>` : ''}
        </div>
        <div style="background:#fef3c7;border-radius:10px;padding:14px;margin-bottom:12px;border-right:3px solid #d97706">
          <p style="margin:0;font-size:11px;color:#92400e;letter-spacing:1px">🟨 TRADE MARKETING DECISION / قرار التريد ماركتنج</p>
          <p style="margin:6px 0 0;font-size:14px;color:#78350f;font-weight:600">${tm.ar} — ${tm.en}</p>
          ${s.tm_notes ? `<p style="margin:4px 0 0;font-size:12px;color:#92400e;line-height:1.6">📝 ${s.tm_notes}</p>` : ''}
        </div>
        <div style="background:#dcfce7;border-radius:10px;padding:14px;margin-bottom:16px;border-right:3px solid #16a34a">
          <p style="margin:0;font-size:11px;color:#166534;letter-spacing:1px">🟩 FINAL DECISION + MANAGER NOTES / القرار النهائي</p>
          <p style="margin:6px 0 0;font-size:14px;color:#14532d;font-weight:700">${fin.ar} — ${fin.en}</p>
          ${s.rm_notes ? `<p style="margin:8px 0 0;font-size:13px;color:#166534;line-height:1.6">💬 ${s.rm_notes}</p>` : ''}
        </div>
        <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:11px;color:#9ca3af;text-align:center">
          Submitted: ${s.submitted_at?.slice(0,10) ?? ''} · Decision: ${s.rm_decision_date?.slice(0,10) ?? ''}
        </div>
      </div>
    </div>
  </div>`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    await requireAuthed(req);
    const { submission_id, is_edit, lang } = await req.json();
    if (!submission_id) return jsonResponse({ error: 'submission_id required' }, 400);

    const admin = adminClient();
    const { data: s, error } = await admin
      .from('submissions')
      .select('*')
      .eq('id', submission_id)
      .single();
    if (error || !s) return jsonResponse({ error: error?.message || 'not found' }, 404);

    const apiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('FROM_EMAIL');
    const toEmail = Deno.env.get('TM_EMAIL');
    if (!apiKey || !fromEmail || !toEmail) {
      return jsonResponse({
        error:
          'Email not configured. Set RESEND_API_KEY, FROM_EMAIL, TM_EMAIL via `supabase secrets set`.',
      }, 503);
    }

    const subject = buildSubject(s, !!is_edit, lang || 'ar');
    const html = buildHtml(s, !!is_edit, lang || 'ar');

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromEmail, to: [toEmail], subject, html }),
    });

    const result = await resendRes.json();
    if (!resendRes.ok) {
      return jsonResponse({ error: result?.message || 'Resend failed', detail: result }, 502);
    }
    return jsonResponse({ ok: true, id: result.id, subject });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
