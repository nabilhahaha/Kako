import { useState } from 'react';
import { useLang } from '../App.jsx';
import { ACTION_CODES, ACTION_LABELS, ACTION_COLORS } from '../lib/actions.js';
import { fmtDate, daysColor } from '../lib/utils.js';
import StatusBadge from './StatusBadge.jsx';
import ActionBadge from './ActionBadge.jsx';
import PhotoViewer from './PhotoViewer.jsx';
import EditCountdown from './EditCountdown.jsx';

// One row per item in a TM/RM detail screen. The caller passes in the local
// pending change for this item and a setter; it tracks both decision and notes.
//
// `role` = 'tm' | 'rm'
// `editable` = whether the parent thinks this item is in the right status for
//              this role to edit it (e.g. TM may edit only pending_tm rows).
export default function VisitItemDecisionRow({
  item,
  role,
  editable,
  pending,
  onPendingChange,
  onCancelEdit,
}) {
  const { tr, lang } = useLang();
  const [viewerOpen, setViewerOpen] = useState(false);
  const dCol = daysColor(item.daysRemaining);
  const dayLabel =
    item.daysRemaining < 0
      ? `${tr.daysExpired} ${Math.abs(item.daysRemaining)} ${tr.daysAr}`
      : `${item.daysRemaining} ${tr.daysAr}`;

  const currentDecision = role === 'tm' ? item.tmDecision : item.roshenDecision;
  const currentNotes    = role === 'tm' ? item.tmNotes    : item.roshenNotes;

  const draftDecision = pending?.decision ?? currentDecision ?? '';
  const draftNotes    = pending?.notes    ?? currentNotes    ?? '';

  const setDecision = (d) =>
    onPendingChange({ decision: d, notes: draftNotes, dirty: true });
  const setNotes = (n) =>
    onPendingChange({ decision: draftDecision, notes: n, dirty: true });

  return (
    <div className="card p-3">
      {/* Item heading */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 line-clamp-2">{item.itemDesc}</p>
          <p className="text-[11px] text-gray-500 mt-0.5" dir="ltr">{item.itemId}</p>
        </div>
        <StatusBadge status={item.itemStatus} />
      </div>

      {/* Compact key metrics */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]">
        <span
          className="font-semibold px-2 py-0.5 rounded-full"
          style={{ background: dCol.bg, color: dCol.fg }}
        >
          📅 {dayLabel} · {fmtDate(item.expiryDate, lang)}
        </span>
        <span className="text-gray-500">
          {tr.systemQty}: <strong>{item.netQty}</strong> · {tr.physicalQty}:{' '}
          <strong>{item.physQty}</strong> {tr.cases}
        </span>
      </div>

      {/* Salesman suggestion (always visible) */}
      {item.salesmanSuggestion && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-blue-700">🟦 {tr.salesmanSuggestion}:</span>
          <ActionBadge action={item.salesmanSuggestion} size="sm" muted />
          {item.salesmanNotes && (
            <span className="text-[10px] text-gray-500 italic truncate">
              "{item.salesmanNotes}"
            </span>
          )}
        </div>
      )}

      {/* TM existing decision (visible when RM is reviewing) */}
      {role === 'rm' && item.tmDecision && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-amber-700">🟨 {tr.tmDecision}:</span>
          <ActionBadge action={item.tmDecision} size="sm" />
          {item.tmNotes && (
            <span className="text-[10px] text-gray-500 italic truncate">"{item.tmNotes}"</span>
          )}
        </div>
      )}

      {/* Existing decision banner if no longer editable */}
      {!editable && currentDecision && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-green-700">
            {role === 'tm' ? '🟨' : '🟩'}{' '}
            {role === 'tm' ? tr.tmDecision : tr.roshenFinalDecision}:
          </span>
          <ActionBadge action={currentDecision} size="sm" />
        </div>
      )}

      {/* Editable decision controls */}
      {editable && (
        <div className="mt-2 space-y-2 bg-gray-50 -mx-3 -mb-3 p-3 rounded-b-card border-t border-gray-100">
          <div className="grid grid-cols-2 gap-1.5">
            {ACTION_CODES.map((code) => {
              const sel = draftDecision === code;
              const c = ACTION_COLORS[code];
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setDecision(code)}
                  className="rounded-input border-2 px-2 py-1.5 text-[11px] font-semibold text-start transition active:scale-[0.99]"
                  style={{
                    background: sel ? c.bg : 'white',
                    borderColor: sel ? c.border : '#e5e7eb',
                    color: c.fg,
                  }}
                >
                  {ACTION_LABELS[code][lang]}
                </button>
              );
            })}
          </div>

          <textarea
            className="input-field text-xs"
            rows={2}
            maxLength={300}
            placeholder={role === 'tm' ? tr.tmNotesPlaceholder : tr.rmNotesPlaceholder}
            value={draftNotes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {role === 'rm' && item.itemStatus === 'approved' && (
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <EditCountdown submission={item} />
              {onCancelEdit && (
                <button onClick={onCancelEdit} className="btn-ghost text-[11px]">
                  {tr.cancel}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Photos */}
      {(item.photoExpiryPath || item.photoQtyPath) && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <button
            onClick={() => setViewerOpen(true)}
            className="btn-ghost text-xs text-roshen-700 w-full"
          >
            📷 {tr.viewBothPhotos}
          </button>
        </div>
      )}

      {viewerOpen && (
        <PhotoViewer submission={item} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  );
}
