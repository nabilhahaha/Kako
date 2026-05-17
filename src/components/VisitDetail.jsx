import { useState } from 'react';
import { useLang } from '../App.jsx';
import { fmtDate, fmtDateTime, daysColor } from '../lib/utils.js';
import StatusBadge from './StatusBadge.jsx';
import ActionBadge from './ActionBadge.jsx';
import PhotoViewer from './PhotoViewer.jsx';
import EditCountdown from './EditCountdown.jsx';

// Read-only visit + items summary. Used in salesman tracker and as the body
// of the supervisor / RM detail views (which add decision controls below it).
export default function VisitDetail({ visit, items }) {
  const { tr, lang } = useLang();
  const [viewerItem, setViewerItem] = useState(null);

  return (
    <div className="space-y-3">
      {/* Visit summary */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base text-gray-900">🏪 {visit.custName}</h2>
            <p className="text-xs text-gray-500 mt-0.5" dir="ltr">{visit.custAccount}</p>
          </div>
          <StatusBadge status={visit.status} />
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm mt-3">
          <Field label={tr.salesman} value={visit.salesmanName} />
          <Field label={tr.visitDate} value={fmtDate(visit.visitDate, lang)} />
          <Field
            label={tr.submittedAt}
            value={visit.submittedAt ? fmtDateTime(visit.submittedAt, lang) : '—'}
          />
          <Field label={tr.visitId} value={<span dir="ltr">#{visit.id.slice(-6)}</span>} />
        </dl>

        {visit.notes && (
          <p className="mt-3 p-2 text-sm bg-gray-50 rounded-md whitespace-pre-wrap">
            📝 {visit.notes}
          </p>
        )}
      </div>

      {/* Items list */}
      <div className="space-y-2">
        <h3 className="font-bold text-sm text-gray-700 px-1">
          📦 {tr.items} ({items.length})
        </h3>
        {items.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm card">{tr.noItemsYet}</p>
        ) : (
          items.map((it) => (
            <ItemReadOnly
              key={it.id}
              item={it}
              onViewPhotos={() => setViewerItem(it)}
            />
          ))
        )}
      </div>

      {viewerItem && (
        <PhotoViewer submission={viewerItem} onClose={() => setViewerItem(null)} />
      )}
    </div>
  );
}

function ItemReadOnly({ item, onViewPhotos }) {
  const { tr, lang } = useLang();
  const dCol = daysColor(item.daysRemaining);
  const dayLabel =
    item.daysRemaining < 0
      ? `${tr.daysExpired} ${Math.abs(item.daysRemaining)} ${tr.daysAr}`
      : `${item.daysRemaining} ${tr.daysAr}`;

  return (
    <div className="card p-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 line-clamp-2">{item.itemDesc}</p>
          <p className="text-[11px] text-gray-500 mt-0.5" dir="ltr">{item.itemId}</p>
        </div>
        <StatusBadge status={item.itemStatus} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: dCol.bg, color: dCol.fg }}
        >
          📅 {dayLabel} · {fmtDate(item.expiryDate, lang)}
        </span>
        <span className="text-[11px] text-gray-500">
          {tr.systemQty}: <strong>{item.netQty}</strong> / {item.physQty} {tr.cases}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {item.salesmanSuggestion && (
          <span className="text-[10px] text-gray-400">
            🟦 <ActionBadge action={item.salesmanSuggestion} size="sm" muted />
          </span>
        )}
        {item.tmDecision && (
          <span className="text-[10px] text-gray-400">
            🟨 <ActionBadge action={item.tmDecision} size="sm" />
          </span>
        )}
        {item.roshenDecision && (
          <span className="text-[10px] text-gray-400">
            🟩 <ActionBadge action={item.roshenDecision} size="sm" />
          </span>
        )}
      </div>

      {item.salesmanNotes && (
        <p className="text-[11px] text-blue-900 bg-blue-50 p-1.5 rounded-md mb-1.5 whitespace-pre-wrap">
          📝 {item.salesmanNotes}
        </p>
      )}
      {item.tmNotes && (
        <p className="text-[11px] text-amber-900 bg-amber-50 p-1.5 rounded-md mb-1.5 whitespace-pre-wrap">
          🟨 {item.tmNotes}
        </p>
      )}
      {item.roshenNotes && (
        <p className="text-[11px] text-green-900 bg-green-50 p-1.5 rounded-md mb-1.5 whitespace-pre-wrap">
          💬 {item.roshenNotes}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
        {item.itemStatus === 'approved' ? <EditCountdown submission={item} /> : <span />}
        {(item.photoExpiryPath || item.photoQtyPath) && (
          <button onClick={onViewPhotos} className="btn-ghost text-xs text-roshen-700">
            📷 {tr.viewBothPhotos}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 mb-0.5">{label}</dt>
      <dd className="font-semibold text-gray-900 break-words text-sm">{value}</dd>
    </div>
  );
}
