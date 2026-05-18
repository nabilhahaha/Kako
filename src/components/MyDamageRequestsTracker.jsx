import { useEffect, useMemo, useState } from 'react';
import { useAuth, useLang } from '../App.jsx';
import { useMyDamageRequests } from '../lib/hooks.js';
import { damageRequestFromDb, damageItemFromDb } from '../lib/mapping.js';
import { db } from '../lib/db.js';
import { fmtDateTime } from '../lib/utils.js';
import DamageRequestDetail from './DamageRequestDetail.jsx';
import PdfButton from './PdfButton.jsx';
import EmailButton from './EmailButton.jsx';
import RefreshButton from './RefreshButton.jsx';
import { useRefresh } from '../lib/useRefresh.js';

const STATUS_TONE = {
  submitted:   { bg: '#fef3c7', fg: '#92400e', label: 'damageAwaitingTm' },
  tm_approved: { bg: '#dcfce7', fg: '#166534', label: 'damageApproved' },
  tm_rejected: { bg: '#fee2e2', fg: '#991b1b', label: 'damageRejected' },
};

export default function MyDamageRequestsTracker() {
  const { tr } = useLang();
  const { user } = useAuth();
  const { data: rows, loading, reload } = useMyDamageRequests(user?.id);
  const requests = useMemo(() => (rows || []).map(damageRequestFromDb), [rows]);
  const refreshState = useRefresh(async () => {
    await reload?.();
  });

  const [openId, setOpenId] = useState(null);

  if (openId) {
    return (
      <OpenView id={openId} onBack={() => setOpenId(null)} />
    );
  }

  return (
    <div className="fade-in">
      <div className="flex items-center justify-end gap-2 px-3 pt-2">
        <RefreshButton
          onRefresh={refreshState.refresh}
          lastRefreshedAt={refreshState.lastRefreshedAt}
          isRefreshing={refreshState.isRefreshing}
        />
      </div>
      <div className="p-3 space-y-2.5">
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">…</p>
        ) : requests.length === 0 ? (
          <div className="text-center text-gray-500 py-12 text-sm">
            <p className="text-3xl mb-2">📭</p>
            <p>{tr.damageNoneYet}</p>
          </div>
        ) : (
          requests.map((r) => (
            <DamageCard key={r.id} request={r} onClick={() => setOpenId(r.id)} />
          ))
        )}
      </div>
    </div>
  );
}

export function DamageCard({ request, onClick }) {
  const { tr, lang } = useLang();
  const tone = STATUS_TONE[request.status] || STATUS_TONE.submitted;
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
          <p className="font-semibold text-sm text-gray-900 truncate">
            {request.sourceType === 'van'
              ? `🚐 ${tr.damageSourceVan}`
              : `🏪 ${request.custName}`}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {request.salesmanName}
          </p>
        </div>
        <span
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {tr[tone.label]}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
        <span className="text-[10px] text-gray-400 font-mono shrink-0" dir="ltr">
          #{request.id.slice(-6)}
        </span>
        <span className="text-[10px] text-gray-500">
          📤 {fmtDateTime(request.submittedAt, lang)}
        </span>
        <div className="flex items-center gap-1.5">
          <PdfButton damageRequest={request} />
          <EmailButton damageRequest={request} />
        </div>
      </div>
    </div>
  );
}

/* Detail view loader */
function OpenView({ id, onBack }) {
  const { tr } = useLang();
  const [req, setReq] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [r, its] = await Promise.all([
        db.getDamageRequest(id),
        db.listDamageItems(id),
      ]);
      if (!active) return;
      setReq(damageRequestFromDb(r));
      setItems(its.map(damageItemFromDb));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading || !req) {
    return <p className="text-center text-gray-400 py-12 text-sm">…</p>;
  }

  return (
    <div className="p-3 space-y-3 fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={onBack} className="btn-ghost text-sm">← {tr.back}</button>
        <div className="flex items-center gap-1.5">
          <PdfButton damageRequest={req} items={items} size="md" />
          <EmailButton damageRequest={req} items={items} size="md" />
        </div>
      </div>
      <DamageRequestDetail request={req} items={items} />
    </div>
  );
}
