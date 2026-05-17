import { useLang } from '../App.jsx';
import { daysColor, fmtDate, fmtDateTime } from '../lib/utils.js';
import ActionBadge from './ActionBadge.jsx';
import StatusBadge from './StatusBadge.jsx';
import DecisionStepper from './DecisionStepper.jsx';
import PdfButton from './PdfButton.jsx';

// Read-only summary block reused by salesman, TM, and RM detail views.
export default function SubmissionDetail({ submission, onViewPhotos, showStepper = true }) {
  const { tr, lang } = useLang();
  const s = submission;
  const d = daysColor(s.daysRemaining);
  const dayLabel =
    s.daysRemaining < 0
      ? `${tr.daysExpired} ${Math.abs(s.daysRemaining)} ${tr.daysAr}`
      : `${s.daysRemaining} ${tr.daysAr}`;

  return (
    <div className="space-y-3">
      {showStepper && (
        <div className="card p-3.5">
          <DecisionStepper submission={s} />
        </div>
      )}

      {/* Item + customer */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base text-gray-900">{s.itemDesc}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              SKU: <span dir="ltr">{s.itemId}</span>
            </p>
          </div>
          <StatusBadge status={s.status} />
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm mt-3">
          <Field label={tr.salesman} value={s.salesmanName} />
          <Field label={tr.selectCustomer} value={`${s.custName}`} hint={s.custAccount} />
          <Field label={tr.systemQty} value={`${s.netQty} ${tr.cases}`} />
          <Field label={tr.physicalQty} value={`${s.physQty} ${tr.cases}`} />
          <Field label={tr.expiryDate} value={fmtDate(s.expiryDate, lang)} />
          <div>
            <dt className="text-xs text-gray-500 mb-0.5">{tr.daysRemaining}</dt>
            <dd>
              <span
                className="inline-block text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: d.bg, color: d.fg }}
              >
                📅 {dayLabel}
              </span>
            </dd>
          </div>
        </dl>

        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          {onViewPhotos && (
            <button onClick={onViewPhotos} className="btn-secondary flex-1 text-sm">
              📷 {tr.viewBothPhotos}
            </button>
          )}
          <div className="flex-1">
            <PdfButton submission={s} size="md" variant="secondary" stop={false} fullWidth />
          </div>
        </div>
      </div>

      {/* Salesman suggestion */}
      {s.salesmanSuggestion && (
        <div
          className="rounded-card p-3.5 border-r-4 border-l-0"
          style={{ background: '#eff6ff', borderColor: '#2563eb' }}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
          <p className="text-[11px] font-bold text-blue-800 tracking-wider mb-1.5">
            🟦 {tr.salesmanSuggestion}
          </p>
          <ActionBadge action={s.salesmanSuggestion} size="md" />
          {s.salesmanNotes && (
            <p className="mt-2 text-sm text-blue-900 leading-relaxed whitespace-pre-wrap">
              📝 {s.salesmanNotes}
            </p>
          )}
        </div>
      )}

      {/* TM decision */}
      {s.tmDecision && (
        <div
          className="rounded-card p-3.5 border-r-4 border-l-0"
          style={{ background: '#fef3c7', borderColor: '#d97706' }}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
          <p className="text-[11px] font-bold text-amber-800 tracking-wider mb-1.5">
            🟨 {tr.tmDecision}
          </p>
          <ActionBadge action={s.tmDecision} size="md" />
          {s.tmNotes && (
            <p className="mt-2 text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">
              📝 {s.tmNotes}
            </p>
          )}
          {s.tmDecisionDate && (
            <p className="mt-1 text-[11px] text-amber-700">
              {fmtDateTime(s.tmDecisionDate, lang)}
            </p>
          )}
        </div>
      )}

      {/* RM decision */}
      {s.roshenDecision && (
        <div
          className="rounded-card p-3.5 border-r-4 border-l-0"
          style={{ background: '#dcfce7', borderColor: '#16a34a' }}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
          <p className="text-[11px] font-bold text-green-800 tracking-wider mb-1.5">
            🟩 {tr.roshenFinalDecision}
          </p>
          <ActionBadge action={s.roshenDecision} size="lg" />
          {s.roshenNotes && (
            <p className="mt-2 text-sm text-green-900 leading-relaxed whitespace-pre-wrap">
              💬 {s.roshenNotes}
            </p>
          )}
          {s.roshenDecisionDate && (
            <p className="mt-1 text-[11px] text-green-700">
              {fmtDateTime(s.roshenDecisionDate, lang)}
            </p>
          )}
          {s.editHistory && s.editHistory.length > 0 && (
            <div className="mt-3 pt-3 border-t border-green-300">
              <p className="text-[11px] font-bold text-purple-800 mb-1.5">
                ✏️ {tr.editHistory}
              </p>
              <ul className="space-y-1.5">
                {s.editHistory.map((h, i) => (
                  <li key={i} className="text-xs text-purple-900">
                    <span className="font-semibold">{fmtDateTime(h.timestamp, lang)}</span> —{' '}
                    <ActionBadge action={h.previousAction} size="sm" muted /> →{' '}
                    <ActionBadge action={h.newAction} size="sm" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, hint }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 mb-0.5">{label}</dt>
      <dd className="font-semibold text-gray-900 break-words">{value}</dd>
      {hint && <p className="text-[11px] text-gray-400" dir="ltr">{hint}</p>}
    </div>
  );
}
