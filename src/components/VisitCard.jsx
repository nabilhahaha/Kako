import { useLang } from '../App.jsx';
import { fmtDateTime } from '../lib/utils.js';
import StatusBadge from './StatusBadge.jsx';

export default function VisitCard({ visit, itemCount = 0, onClick, rightSlot = null }) {
  const { tr, lang } = useLang();
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
      className="card w-full p-3.5 text-start cursor-pointer transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-roshen-500 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 truncate">🏪 {visit.custName}</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{visit.salesmanName}</p>
        </div>
        <StatusBadge status={visit.status} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-[11px] bg-roshen-50 text-roshen-700 font-semibold px-2 py-0.5 rounded-full">
          📦 {tr.itemsCountLabel.replace('{n}', itemCount)}
        </span>
        <span className="text-[11px] text-gray-500">
          {visit.submittedAt
            ? `📤 ${fmtDateTime(visit.submittedAt, lang)}`
            : `📝 ${fmtDateTime(visit.createdAt, lang)}`}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
        <span className="text-[10px] text-gray-400 truncate font-mono" dir="ltr">
          #{visit.id.slice(-6)}
        </span>
        {rightSlot}
      </div>
    </div>
  );
}
