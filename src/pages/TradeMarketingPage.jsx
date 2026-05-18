import { useEffect, useMemo, useState } from 'react';
import { useAuth, useLang, useToast } from '../App.jsx';
import Header from '../components/Header.jsx';
import VisitCard from '../components/VisitCard.jsx';
import VisitDetail from '../components/VisitDetail.jsx';
import VisitItemDecisionRow from '../components/VisitItemDecisionRow.jsx';
import PdfButton from '../components/PdfButton.jsx';
import EmailButton from '../components/EmailButton.jsx';
import VanStockUploadPanel from '../components/VanStockUploadPanel.jsx';
import RefreshButton from '../components/RefreshButton.jsx';
import { useRefresh } from '../lib/useRefresh.js';
import { useAllDamageRequests } from '../lib/hooks.js';
import { damageRequestFromDb, damageItemFromDb } from '../lib/mapping.js';
import { db } from '../lib/db.js';
import { DamageCard } from '../components/MyDamageRequestsTracker.jsx';
import DamageRequestDetail from '../components/DamageRequestDetail.jsx';
import DamageDecisionModal from '../components/DamageDecisionModal.jsx';
import { useAllVisits } from '../lib/hooks.js';
import { visitFromDb, visitItemFromDb } from '../lib/mapping.js';

const TABS = [
  { key: 'pending',  icon: '⏳', labelKey: 'pendingNew' },
  { key: 'history',  icon: '📋', labelKey: 'history' },
  { key: 'damage',   icon: '💔', labelKey: 'damageRequests' },
  { key: 'vanStock', icon: '🚐', labelKey: 'uploadVanStock' },
];

export default function TradeMarketingPage() {
  const { tr } = useLang();
  const { signOut } = useAuth();
  const [tab, setTab] = useState('pending');
  const [openId, setOpenId] = useState(null);

  const { data: rows, loading, reload: reloadVisits } = useAllVisits();
  const visits = useMemo(() => (rows || []).map(visitFromDb), [rows]);

  const listRefresh = useRefresh(async () => {
    await reloadVisits?.();
  });

  // Item counts per visit (lazy).
  const [itemCounts, setItemCounts] = useState({});
  useEffect(() => {
    let active = true;
    (async () => {
      const out = {};
      for (const v of visits) {
        const items = await db.listVisitItems(v.id).catch(() => []);
        out[v.id] = items.length;
      }
      if (active) setItemCounts(out);
    })();
    return () => {
      active = false;
    };
  }, [visits]);

  const pending = useMemo(() => visits.filter((v) => v.status === 'pending_tm'), [visits]);
  const history = useMemo(() => visits.filter((v) => v.status !== 'pending_tm'), [visits]);

  // Damage requests for the dedicated tab.
  const { data: damageRows, reload: reloadDamage } = useAllDamageRequests();
  const damageRequests = useMemo(
    () => (damageRows || []).map(damageRequestFromDb),
    [damageRows],
  );
  const [openDamageId, setOpenDamageId] = useState(null);

  if (openId) {
    return (
      <TMVisitDetail
        visitId={openId}
        onBack={() => setOpenId(null)}
        onLogout={signOut}
      />
    );
  }

  return (
    <>
      <Header title={tr.tmDashboard} onLogout={signOut} />
      <div className="flex items-center justify-end gap-2 px-3 pt-2">
        <RefreshButton
          onRefresh={listRefresh.refresh}
          lastRefreshedAt={listRefresh.lastRefreshedAt}
          isRefreshing={listRefresh.isRefreshing}
        />
      </div>
      <div className="flex border-b border-gray-200 bg-white sticky top-0 z-20">
        {TABS.map((t) => {
          const count = t.key === 'pending' ? pending.length : history.length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            >
              {t.icon} {tr[t.labelKey]}
              {count > 0 && (
                <span className="ms-1 text-[10px] bg-gray-200 text-gray-700 rounded-full px-1.5 py-0.5">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {openDamageId && (
        <TMDamageDetail
          id={openDamageId}
          onBack={() => setOpenDamageId(null)}
          onDone={() => {
            setOpenDamageId(null);
            reloadDamage?.();
          }}
        />
      )}

      <div className="p-3 space-y-2.5 fade-in">
        {tab === 'vanStock' ? (
          <VanStockUploadPanel />
        ) : tab === 'damage' ? (
          damageRequests.length === 0 ? (
            <div className="text-center text-gray-500 py-12 text-sm">
              <p className="text-3xl mb-2">📭</p>
              <p>{tr.damageNoneYet}</p>
            </div>
          ) : (
            damageRequests.map((r) => (
              <DamageCard
                key={r.id}
                request={r}
                onClick={() => setOpenDamageId(r.id)}
              />
            ))
          )
        ) : loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">…</p>
        ) : (tab === 'pending' ? pending : history).length === 0 ? (
          <div className="text-center text-gray-500 py-12 text-sm">
            <p className="text-3xl mb-2">📭</p>
            <p>{tr.visitsListEmpty}</p>
          </div>
        ) : (
          (tab === 'pending' ? pending : history).map((v) => (
            <VisitCard
              key={v.id}
              visit={v}
              itemCount={itemCounts[v.id] || 0}
              onClick={() => setOpenId(v.id)}
            />
          ))
        )}
      </div>
    </>
  );
}

/* ───────── TM visit detail with per-item decisions ───────── */
function TMVisitDetail({ visitId, onBack, onLogout }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const { user } = useAuth();
  const [visit, setVisit] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingByItem, setPendingByItem] = useState({});
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    const [v, it] = await Promise.all([db.getVisit(visitId), db.listVisitItems(visitId)]);
    setVisit(visitFromDb(v));
    setItems(it.map(visitItemFromDb));
    setLoading(false);
    setPendingByItem({});
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  const dirtyCount = Object.values(pendingByItem).filter(
    (p) => p?.dirty && p.decision,
  ).length;

  const saveAll = async () => {
    const entries = Object.entries(pendingByItem).filter(
      ([, p]) => p?.dirty && p.decision,
    );
    if (entries.length === 0) {
      toast(tr.noDecisionsToSave, 'error');
      return;
    }
    setSaving(true);
    try {
      for (const [itemId, p] of entries) {
        await db.updateVisitItem(itemId, {
          tm_id: user.id,
          tm_decision: p.decision,
          tm_notes: p.notes?.trim() || null,
          tm_decision_date: new Date().toISOString(),
          item_status: p.decision === 'no_action' ? 'closed_no_action' : 'pending_roshen',
        });
      }
      toast(tr.decisionsBatchSaved, 'success');
      await reload();
    } catch (e) {
      console.error(e);
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !visit) {
    return (
      <>
        <Header title={tr.tmDashboard} onBack={onBack} onLogout={onLogout} />
        <p className="text-center text-gray-400 py-12 text-sm">…</p>
      </>
    );
  }

  const tmEligibleItems = items.filter((i) => i.itemStatus === 'pending_tm');

  return (
    <>
      <Header title={tr.tmDashboard} onBack={onBack} onLogout={onLogout} />
      <div className="p-3 space-y-3 fade-in pb-32">
        {/* Visit info (read-only) */}
        <div className="card p-3.5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-base text-gray-900">🏪 {visit.custName}</h2>
              <p className="text-xs text-gray-500 mt-0.5" dir="ltr">
                {visit.custAccount} · #{visit.id.slice(-6)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {visit.salesmanName} · {items.length} {tr.items}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <PdfButton visit={visit} items={items} />
              <EmailButton visit={visit} items={items} />
            </div>
          </div>
        </div>

        {/* Per-item decision rows */}
        <h3 className="font-bold text-sm text-gray-700 px-1">
          📦 {tr.items} ({items.length})
        </h3>
        {items.map((it) => (
          <VisitItemDecisionRow
            key={it.id}
            item={it}
            role="tm"
            editable={it.itemStatus === 'pending_tm'}
            pending={pendingByItem[it.id]}
            onPendingChange={(p) =>
              setPendingByItem((prev) => ({ ...prev, [it.id]: p }))
            }
          />
        ))}

        {/* Footer save bar */}
        {tmEligibleItems.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-20">
            <div className="max-w-page mx-auto">
              <button
                onClick={saveAll}
                disabled={dirtyCount === 0 || saving}
                className="btn-primary w-full"
              >
                {saving ? '...' : `💾 ${tr.saveAllDecisions} (${dirtyCount})`}
              </button>
            </div>
          </div>
        )}

        {tmEligibleItems.length === 0 && (
          <div className="card p-4 text-center text-sm text-gray-500">
            {tr.decisionSaved} — all items handled.
          </div>
        )}

        {/* For history view, also include the read-only VisitDetail at the bottom */}
        {tmEligibleItems.length === 0 && (
          <div className="mt-4">
            <VisitDetail visit={visit} items={items} />
          </div>
        )}
      </div>
    </>
  );
}

/* ───────── TM Damage detail (modal-on-top page) ───────── */
function TMDamageDetail({ id, onBack, onDone }) {
  const { tr } = useLang();
  const [req, setReq] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState(null); // 'approve' | 'reject'

  const reload = async () => {
    setLoading(true);
    const [r, its] = await Promise.all([
      db.getDamageRequest(id),
      db.listDamageItems(id),
    ]);
    setReq(damageRequestFromDb(r));
    setItems(its.map(damageItemFromDb));
    setLoading(false);
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading || !req) {
    return (
      <div className="fixed inset-0 z-30 bg-white p-3 overflow-y-auto">
        <p className="text-center text-gray-400 py-12 text-sm">…</p>
      </div>
    );
  }

  const canDecide = req.status === 'submitted';

  return (
    <div className="fixed inset-0 z-30 bg-gray-50 overflow-y-auto">
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between gap-2 sticky top-0 z-10">
        <button onClick={onBack} className="btn-ghost text-sm">← {tr.back}</button>
        <div className="flex items-center gap-1.5">
          <PdfButton damageRequest={req} items={items} size="md" stop={false} />
          <EmailButton damageRequest={req} items={items} size="md" stop={false} />
        </div>
      </div>
      <div className="p-3 space-y-3 fade-in pb-32">
        <DamageRequestDetail request={req} items={items} />
      </div>

      {canDecide && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-20">
          <div className="max-w-page mx-auto flex gap-2">
            <button
              onClick={() => setDecision('reject')}
              className="flex-1 rounded-input px-4 py-3 font-semibold text-white bg-red-600 hover:bg-red-700 transition active:scale-[0.98]"
            >
              ❌ {tr.damageDecisionReject}
            </button>
            <button
              onClick={() => setDecision('approve')}
              className="flex-1 rounded-input px-4 py-3 font-semibold text-white bg-green-600 hover:bg-green-700 transition active:scale-[0.98]"
            >
              ✅ {tr.damageDecisionApprove}
            </button>
          </div>
        </div>
      )}

      {decision && (
        <DamageDecisionModal
          request={req}
          decision={decision}
          onClose={() => setDecision(null)}
          onDone={async () => {
            setDecision(null);
            await reload();
            onDone?.();
          }}
        />
      )}
    </div>
  );
}
