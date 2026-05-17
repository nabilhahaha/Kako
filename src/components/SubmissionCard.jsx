import { useLang } from '../App.jsx';
import { daysColor, fmtDateTime } from '../lib/utils.js';
import StatusBadge from './StatusBadge.jsx';
import ActionBadge from './ActionBadge.jsx';
import EditCountdown from './EditCountdown.jsx';
import PdfButton from './PdfButton.jsx';

export default function SubmissionCard({
  submission: s,
  onClick,
  showStepper = false,
  showCountdown = false,
}) {
  const { tr, lang } = useLang();
  const d = daysColor(s.daysRemaining);
  const dayLabel =
    s.daysRemaining < 0
      ? `${tr.daysExpired} ${Math.abs(s.daysRemaining)} ${tr.daysAr}`
      : `${s.daysRemaining} ${tr.daysAr}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="card w-full p-3.5 text-start active:scale-[0.99] transition hover:shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-roshen-500"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 line-clamp-2">{s.itemDesc}</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {s.custName} · {s.salesmanName}
          </p>
        </div>
        <StatusBadge status={s.status} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: d.bg, color: d.fg }}
        >
          📅 {dayLabel}
        </span>
        <span className="text-[11px] text-gray-500">
          {tr.netQty}: <strong className="text-gray-700">{s.netQty}</strong> / {s.physQty}{' '}
          {tr.cases}
        </span>
      </div>

      {/* Suggestion / TM / RM badges */}
      <div className="flex flex-wrap gap-1.5">
        {s.salesmanSuggestion && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">{tr.yourSuggestion}:</span>
            <ActionBadge action={s.salesmanSuggestion} size="sm" muted />
          </div>
        )}
        {s.tmDecision && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">TM:</span>
            <ActionBadge action={s.tmDecision} size="sm" />
          </div>
        )}
        {s.roshenDecision && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">RM:</span>
            <ActionBadge action={s.roshenDecision} size="sm" />
          </div>
        )}
      </div>

      {showCountdown && s.status === 'approved' && (
        <div className="mt-2">
          <EditCountdown submission={s} />
          {s.editHistory && s.editHistory.length > 0 && (
            <span className="ms-2 text-[11px] font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
              ✏️ {tr.decisionEdited}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
        <span className="text-[10px] text-gray-400 truncate flex-1">
          {tr.submittedAt}: {fmtDateTime(s.submittedAt, lang)}
        </span>
        <PdfButton submission={s} />
      </div>
    </div>
  );
}
