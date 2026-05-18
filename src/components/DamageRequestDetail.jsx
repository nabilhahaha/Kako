import { useEffect, useState } from 'react';
import { useLang } from '../App.jsx';
import { fmtDate, fmtDateTime } from '../lib/utils.js';
import { db } from '../lib/db.js';

const STATUS_TONE = {
  submitted:    { bg: '#fef3c7', fg: '#92400e', label: 'damageAwaitingTm' },
  tm_approved:  { bg: '#dcfce7', fg: '#166534', label: 'damageApproved' },
  tm_rejected:  { bg: '#fee2e2', fg: '#991b1b', label: 'damageRejected' },
};

export default function DamageRequestDetail({ request, items }) {
  const { tr, lang } = useLang();
  const tone = STATUS_TONE[request.status] || STATUS_TONE.submitted;

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base text-gray-900">
              {request.sourceType === 'van'
                ? `🚐 ${tr.damageSourceVan}`
                : `🏪 ${request.custName}`}
            </h2>
            {request.sourceType === 'customer' && (
              <p className="text-xs text-gray-500 mt-0.5" dir="ltr">{request.custAccount}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">{request.salesmanName}</p>
          </div>
          <span
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {tr[tone.label]}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm mt-3">
          <Field label={tr.damageRequestId} value={<span dir="ltr">#{request.id.slice(-6)}</span>} />
          <Field label={tr.submittedAt} value={fmtDateTime(request.submittedAt, lang)} />
        </dl>
      </div>

      {/* TM decision card */}
      {request.status !== 'submitted' && (
        <div
          className="rounded-card p-3.5 border-r-4 border-l-0"
          style={{
            background: tone.bg,
            borderColor: tone.fg,
          }}
        >
          <p className="text-[11px] font-bold tracking-wider mb-1" style={{ color: tone.fg }}>
            🟨 {tr.tmDecision} — {tr[tone.label]}
          </p>
          <p className="text-[11px] text-gray-600">
            {fmtDateTime(request.tmDecidedAt, lang)}
          </p>
          {request.tmComment && (
            <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: tone.fg }}>
              💬 {request.tmComment}
            </p>
          )}
        </div>
      )}

      {/* Items */}
      <div className="space-y-2">
        <h3 className="font-bold text-sm text-gray-700 px-1">
          {tr.damageItems} ({items.length})
        </h3>
        {items.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm card">{tr.damageNoItems}</p>
        ) : (
          items.map((it, i) => <ItemReadOnly key={it.id} item={it} index={i + 1} />)
        )}
      </div>
    </div>
  );
}

function ItemReadOnly({ item, index }) {
  const { tr, lang } = useLang();
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    let active = true;
    if (!item.photoUrl) return;
    db.getPhotoUrl(item.photoUrl).then((u) => {
      if (active) setPhotoUrl(u);
    });
    return () => {
      active = false;
    };
  }, [item.photoUrl]);

  return (
    <div className="card p-3">
      <div className="flex items-start gap-2 mb-1.5">
        <span className="w-6 h-6 rounded-md bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 line-clamp-2">{item.itemName}</p>
          <p className="text-[11px] text-gray-500 mt-0.5" dir="ltr">{item.itemNumber}</p>
        </div>
        <span className="text-[12px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full whitespace-nowrap">
          {item.quantity} {item.unit || ''}
        </span>
      </div>
      {item.notes && (
        <p className="text-[11px] text-gray-700 bg-gray-50 p-1.5 rounded-md mb-1.5 whitespace-pre-wrap">
          📝 {item.notes}
        </p>
      )}
      {photoUrl && (
        <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="block mt-1">
          <img src={photoUrl} alt="" className="rounded-md max-h-48 object-contain border border-gray-200" />
        </a>
      )}
      <p className="text-[10px] text-gray-400 mt-1">{fmtDate(item.createdAt, lang)}</p>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 mb-0.5">{label}</dt>
      <dd className="font-semibold text-gray-900 text-sm break-words">{value}</dd>
    </div>
  );
}
