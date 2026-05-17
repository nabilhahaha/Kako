// EmailJS sender. Loads the SDK from CDN on demand.
import { ACTION_LABELS } from './actions.js';

const CDN = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';

let loadingPromise = null;

const loadEmailJS = () => {
  if (window.emailjs) return Promise.resolve(window.emailjs);
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CDN;
    script.async = true;
    script.onload = () => resolve(window.emailjs);
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error('Failed to load EmailJS SDK'));
    };
    document.head.appendChild(script);
  });
  return loadingPromise;
};

const fmt = (iso, lang) => {
  if (!iso) return '';
  const locale = lang === 'en' ? 'en-GB' : 'ar-EG';
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const buildSubject = (submission, isEdit, lang = 'ar') => {
  const finalLabel = ACTION_LABELS[submission.roshenDecision];
  if (!finalLabel) return '[Roshen KSA] Decision';

  if (isEdit) {
    const history = submission.editHistory || [];
    const last = history[history.length - 1];
    const oldAction = last?.previousAction;
    const oldLabel = oldAction ? ACTION_LABELS[oldAction] : { ar: '', en: '' };
    return lang === 'en'
      ? `[Roshen KSA] ⚠️ DECISION UPDATED — was ${oldLabel.en}, now ${finalLabel.en} — ${submission.itemId}`
      : `[Roshen KSA] ⚠️ تعديل قرار سابق — تغيير من ${oldLabel.ar} إلى ${finalLabel.ar} — ${submission.itemId}`;
  }

  return lang === 'en'
    ? `[Roshen KSA] Final decision — ${finalLabel.en} — ${submission.itemId} — ${submission.custName}`
    : `[Roshen KSA] قرار نهائي — ${finalLabel.ar} — ${submission.itemId} — ${submission.custName}`;
};

export const sendDecisionEmail = async (submission, isEdit, emailConfig, lang = 'ar') => {
  if (!emailConfig?.publicKey || !emailConfig?.serviceId || !emailConfig?.templateId) {
    throw new Error('EmailJS config incomplete');
  }
  if (!emailConfig.tmEmail) throw new Error('Trade Marketing email missing');

  const ejs = await loadEmailJS();
  ejs.init(emailConfig.publicKey);

  const finalLabel = ACTION_LABELS[submission.roshenDecision] || { ar: '', en: '' };
  const tmLabel = ACTION_LABELS[submission.tmDecision] || { ar: '', en: '' };
  const salesmanLabel = ACTION_LABELS[submission.salesmanSuggestion] || { ar: '', en: '' };

  let oldLabel = { ar: '', en: '' };
  if (isEdit && submission.editHistory?.length) {
    const last = submission.editHistory[submission.editHistory.length - 1];
    if (last?.previousAction && ACTION_LABELS[last.previousAction]) {
      oldLabel = ACTION_LABELS[last.previousAction];
    }
  }

  const subject = buildSubject(submission, isEdit, lang);
  const templateId =
    isEdit && emailConfig.templateIdEdit ? emailConfig.templateIdEdit : emailConfig.templateId;

  const variables = {
    to_email: emailConfig.tmEmail,
    from_name: 'Roshen Area Manager',
    reply_to: emailConfig.rmEmail || emailConfig.tmEmail,
    email_subject: subject,
    subject,
    is_edit: isEdit ? 'yes' : '',
    decision_ar: finalLabel.ar,
    decision_en: finalLabel.en,
    old_decision_ar: oldLabel.ar,
    old_decision_en: oldLabel.en,
    salesman_name: submission.salesmanName,
    salesman_suggestion_ar: salesmanLabel.ar,
    salesman_suggestion_en: salesmanLabel.en,
    salesman_notes: submission.salesmanNotes || '',
    tm_decision_ar: tmLabel.ar,
    tm_decision_en: tmLabel.en,
    tm_notes: submission.tmNotes || '',
    customer_name: submission.custName,
    customer_account: submission.custAccount,
    item_description: submission.itemDesc,
    item_id: submission.itemId,
    system_qty: submission.netQty,
    physical_qty: submission.physQty,
    expiry_date: fmt(submission.expiryDate, lang),
    days_remaining: submission.daysRemaining,
    roshen_notes: submission.roshenNotes || '',
    submitted_at: fmt(submission.submittedAt, lang),
    decision_date: fmt(submission.roshenDecisionDate, lang),
    edit_date: isEdit ? fmt(new Date().toISOString(), lang) : '',
  };

  return ejs.send(emailConfig.serviceId, templateId, variables);
};
