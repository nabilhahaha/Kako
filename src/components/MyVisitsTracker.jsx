import { useEffect, useMemo, useState } from 'react';
import { useAuth, useLang, useToast } from '../App.jsx';
import { useMyVisits } from '../lib/hooks.js';
import { visitFromDb, visitItemFromDb } from '../lib/mapping.js';
import { db } from '../lib/db.js';
import VisitCard from './VisitCard.jsx';
import VisitDetail from './VisitDetail.jsx';
import PdfButton from './PdfButton.jsx';
import EmailButton from './EmailButton.jsx';
import RefreshButton from './RefreshButton.jsx';
import { useRefresh } from '../lib/useRefresh.js';

const TABS = [
  { key: 'draft',     icon: '📝', labelKey: 'drafts' },
  { key: 'pending',   icon: '⏳', labelKey: 'pending' },
  { key: 'completed', icon: '✅', labelKey: 'completed' },
];

export default function MyVisitsTracker({ onResumeDraft }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState('pending');
  const [openId, setOpenId] = useState(null);

  const { data: rows, loading, reload } = useMyVisits(user?.id);
  const visits = useMemo(() => (rows || []).map(visitFromDb), [rows]);

  const refreshState = useRefresh(async () => {
    await reload?.();
  });

  // For badge counts we need item counts per visit; fetch lazily.
  const [itemCounts, setItemCounts] = useState({});
  useEffect(() => {
    let active = true;
    (async () => {
      const out = {};
      for (const v of visits) {
        try {
          const items = await db.listVisitItems(v.id);
          out[v.id] = items.length;
        } catch {
          out[v.id] = 0;
        }
      }
      if (active) setItemCounts(out);
    })();
    return () => {
      active = false;
    };
  }, [visits]);

  const filtered = useMemo(() => {
    if (tab === 'draft') return visits.filter((v) => v.status === 'draft');
    if (tab === 'pending')
      return visits.filter((v) => v.status === 'pending_tm' || v.status === 'pending_roshen');
    return visits.filter((v) => v.status === 'completed');
  }, [tab, visits]);

  const counts = useMemo(
    () => ({
      draft: visits.filter((v) => v.status === 'draft').length,
      pending: visits.filter(
        (v) => v.status === 'pending_tm' || v.status === 'pending_roshen',
      ).length,
      completed: visits.filter((v) => v.status === 'completed').length,
    }),
    [visits],
  );

  const handleDeleteDraft = async (id) => {
    if (!confirm(tr.confirmDeleteVisit)) return;
    try {
      await db.deleteVisit(id);
      toast(tr.userDeleted, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (openId) {
    return (
      <VisitOpenView
        visitId={openId}
        onBack={() => setOpenId(null)}
      />
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
      <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
          >
            {t.icon} {tr[t.labelKey]}
            {counts[t.key] > 0 && (
              <span className="ms-1 text-[10px] bg-gray-200 text-gray-700 rounded-full px-1.5 py-0.5">
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-2.5">
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-12 text-sm">
            <p className="text-3xl mb-2">📭</p>
            <p>{tr.visitsListEmpty}</p>
          </div>
        ) : (
          filtered.map((v) =>
            v.status === 'draft' ? (
              <DraftVisitCard
                key={v.id}
                visit={v}
                itemCount={itemCounts[v.id] || 0}
                onResume={() => onResumeDraft?.(v.id)}
                onDelete={() => handleDeleteDraft(v.id)}
              />
            ) : (
              <VisitCard
                key={v.id}
                visit={v}
                itemCount={itemCounts[v.id] || 0}
                onClick={() => setOpenId(v.id)}
              />
            ),
          )
        )}
      </div>
    </div>
  );
}

function DraftVisitCard({ visit, itemCount, onResume, onDelete }) {
  const { tr } = useLang();
  return (
    <div className="card p-3.5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate">🏪 {visit.custName}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {tr.itemsCountLabel.replace('{n}', itemCount)}
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
          📝 {tr.visitDraft}
        </span>
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={onResume} className="btn-primary flex-1 text-sm">
          ▶ {tr.resumeDraft}
        </button>
        <button onClick={onDelete} className="btn-ghost border border-red-200 text-red-700 text-sm">
          🗑
        </button>
      </div>
    </div>
  );
}

function VisitOpenView({ visitId, onBack }) {
  const { tr } = useLang();
  const [visit, setVisit] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [v, it] = await Promise.all([db.getVisit(visitId), db.listVisitItems(visitId)]);
      if (!active) return;
      setVisit(visitFromDb(v));
      setItems(it.map(visitItemFromDb));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [visitId]);

  if (loading || !visit) {
    return <p className="text-center text-gray-400 py-12 text-sm">…</p>;
  }

  return (
    <div className="p-3 space-y-3 fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={onBack} className="btn-ghost text-sm">
          ← {tr.back}
        </button>
        <div className="flex items-center gap-1.5">
          <PdfButton visit={visit} items={items} size="md" />
          <EmailButton visit={visit} items={items} size="md" />
        </div>
      </div>
      <VisitDetail visit={visit} items={items} />
    </div>
  );
}
