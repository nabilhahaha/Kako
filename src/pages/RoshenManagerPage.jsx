import { useEffect, useMemo, useState } from 'react';
import { useAuth, useLang, useToast } from '../App.jsx';
import Header from '../components/Header.jsx';
import VisitCard from '../components/VisitCard.jsx';
import VisitDetail from '../components/VisitDetail.jsx';
import VisitItemDecisionRow from '../components/VisitItemDecisionRow.jsx';
import PdfButton from '../components/PdfButton.jsx';
import UserManagementPanel from '../components/UserManagementPanel.jsx';
import { db } from '../lib/db.js';
import { parseExcel } from '../lib/excel.js';
import { isEditable } from '../lib/utils.js';
import { visitFromDb, visitItemFromDb } from '../lib/mapping.js';
import { useAllVisits, useAggregatedData } from '../lib/hooks.js';

const TABS = [
  { key: 'upload',  icon: '📥', labelKey: 'uploadData' },
  { key: 'pending', icon: '⏳', labelKey: 'awaitingMyDecision' },
  { key: 'mine',    icon: '📋', labelKey: 'myDecisions' },
  { key: 'users',   icon: '👥', labelKey: 'userManagement' },
];

export default function RoshenManagerPage() {
  const { tr } = useLang();
  const { signOut } = useAuth();
  const [tab, setTab] = useState('pending');
  const [openId, setOpenId] = useState(null);

  const { data: rows, loading } = useAllVisits();
  const visits = useMemo(() => (rows || []).map(visitFromDb), [rows]);

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

  // RM pending: any visit with at least one item in pending_roshen.
  // We'll discover by visit.status='pending_roshen'.
  const pending = useMemo(() => visits.filter((v) => v.status === 'pending_roshen'), [visits]);
  const mine = useMemo(() => visits.filter((v) => v.status === 'completed'), [visits]);

  if (openId) {
    return (
      <RMVisitDetail
        visitId={openId}
        onBack={() => setOpenId(null)}
        onLogout={signOut}
      />
    );
  }

  return (
    <>
      <Header title={tr.rmDashboard} onLogout={signOut} />
      <div className="flex border-b border-gray-200 bg-white sticky top-0 z-20 overflow-x-auto">
        {TABS.map((t) => {
          const count =
            t.key === 'pending' ? pending.length : t.key === 'mine' ? mine.length : 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`tab-btn whitespace-nowrap shrink-0 ${tab === t.key ? 'active' : ''}`}
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

      <div className="p-3 space-y-2.5 fade-in">
        {tab === 'upload' && <UploadPanel />}
        {tab === 'pending' &&
          (loading ? (
            <p className="text-center text-gray-400 py-12 text-sm">…</p>
          ) : pending.length === 0 ? (
            <Empty />
          ) : (
            pending.map((v) => (
              <VisitCard
                key={v.id}
                visit={v}
                itemCount={itemCounts[v.id] || 0}
                onClick={() => setOpenId(v.id)}
              />
            ))
          ))}
        {tab === 'mine' &&
          (loading ? (
            <p className="text-center text-gray-400 py-12 text-sm">…</p>
          ) : mine.length === 0 ? (
            <Empty />
          ) : (
            mine.map((v) => (
              <VisitCard
                key={v.id}
                visit={v}
                itemCount={itemCounts[v.id] || 0}
                onClick={() => setOpenId(v.id)}
              />
            ))
          ))}
        {tab === 'users' && <UserManagementPanel />}
      </div>
    </>
  );
}

function Empty() {
  const { tr } = useLang();
  return (
    <div className="text-center text-gray-500 py-12 text-sm">
      <p className="text-3xl mb-2">📭</p>
      <p>{tr.visitsListEmpty}</p>
    </div>
  );
}

/* ───────── Upload Excel ───────── */
function UploadPanel() {
  const { tr } = useLang();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState(null);
  const { data: existing } = useAggregatedData();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStats(null);
    try {
      const { agg, stats: s } = await parseExcel(file);
      if (s.salesmen === 0) {
        toast('Empty file — check column names', 'error');
        return;
      }
      await db.uploadAggregated({
        data: agg,
        salesmen: s.salesmen,
        customers: s.customers,
        items: s.items,
        filename: file.name,
      });
      setStats(s);
      toast(tr.uploadSuccess, 'success');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Parse failed', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="card p-5">
        <h2 className="font-bold text-base mb-1">📥 {tr.uploadExcel}</h2>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">{tr.uploadExcelHint}</p>
        <label
          htmlFor="excel-upload"
          className="block border-2 border-dashed border-roshen-300 hover:border-roshen-500 transition rounded-card p-6 text-center cursor-pointer bg-roshen-50/40"
        >
          <div className="text-4xl mb-2">{uploading ? '⏳' : '📊'}</div>
          <p className="font-semibold text-roshen-700">
            {uploading ? tr.uploading : tr.chooseFile}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">.xlsx / .xls</p>
        </label>
        <input
          id="excel-upload"
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          disabled={uploading}
          onChange={onFile}
        />
      </div>

      {stats && (
        <div className="card p-4 bg-green-50 border-green-200">
          <h3 className="font-bold text-green-800 mb-2 text-sm">✅ {tr.uploadSuccess}</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatCell label={tr.salesmenCount} value={stats.salesmen} />
            <StatCell label={tr.customersCount} value={stats.customers} />
            <StatCell label={tr.itemsCount} value={stats.items} />
          </div>
        </div>
      )}

      {!stats && existing && (
        <div className="card p-4 bg-blue-50 border-blue-200">
          <p className="text-xs text-blue-800 font-semibold">
            ℹ️ {existing.salesmen_count} {tr.salesmenCount} · {existing.customers_count}{' '}
            {tr.customersCount} · {existing.items_count} {tr.itemsCount}
          </p>
          {existing.source_filename && (
            <p className="text-[11px] text-blue-700 mt-1" dir="ltr">
              {existing.source_filename}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value }) {
  return (
    <div className="bg-white rounded-lg p-2 border border-green-200">
      <p className="text-xl font-bold text-green-700">{value.toLocaleString()}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

/* ───────── RM visit detail with per-item RM decisions ───────── */
function RMVisitDetail({ visitId, onBack, onLogout }) {
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

  const isItemRMEditable = (it) =>
    it.itemStatus === 'pending_roshen' ||
    (it.itemStatus === 'approved' && isEditable(it));

  const dirtyCount = Object.values(pendingByItem).filter(
    (p) => p?.dirty && p.decision,
  ).length;

  const saveAll = async () => {
    const entries = Object.entries(pendingByItem).filter(([, p]) => p?.dirty && p.decision);
    if (entries.length === 0) {
      toast(tr.noDecisionsToSave, 'error');
      return;
    }
    setSaving(true);
    try {
      for (const [itemId, p] of entries) {
        const existing = items.find((x) => x.id === itemId);
        const isEdit = existing?.itemStatus === 'approved';
        const now = new Date().toISOString();
        const patch = {
          rm_id: user.id,
          rm_decision: p.decision,
          rm_notes: p.notes?.trim() || null,
        };

        if (isEdit) {
          patch.edit_history = [
            ...(existing.editHistory || []),
            {
              timestamp: now,
              previousAction: existing.roshenDecision,
              newAction: p.decision,
              previousNotes: existing.roshenNotes || '',
            },
          ];
          // Preserve item_status & rm_decision_date — but if changing to no_action, switch to closed.
          patch.item_status = p.decision === 'no_action' ? 'closed_no_action' : 'approved';
        } else {
          patch.rm_decision_date = now;
          patch.item_status = p.decision === 'no_action' ? 'closed_no_action' : 'approved';
        }

        await db.updateVisitItem(itemId, patch);
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
        <Header title={tr.rmDashboard} onBack={onBack} onLogout={onLogout} />
        <p className="text-center text-gray-400 py-12 text-sm">…</p>
      </>
    );
  }

  const eligible = items.filter(isItemRMEditable);

  return (
    <>
      <Header title={tr.rmDashboard} onBack={onBack} onLogout={onLogout} />
      <div className="p-3 space-y-3 fade-in pb-32">
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
            <PdfButton visit={visit} items={items} />
          </div>
        </div>

        <h3 className="font-bold text-sm text-gray-700 px-1">
          📦 {tr.items} ({items.length})
        </h3>
        {items.map((it) => (
          <VisitItemDecisionRow
            key={it.id}
            item={it}
            role="rm"
            editable={isItemRMEditable(it)}
            pending={pendingByItem[it.id]}
            onPendingChange={(p) =>
              setPendingByItem((prev) => ({ ...prev, [it.id]: p }))
            }
          />
        ))}

        {eligible.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-20">
            <div className="max-w-page mx-auto">
              <button
                onClick={saveAll}
                disabled={dirtyCount === 0 || saving}
                className="btn-primary w-full"
              >
                {saving ? '...' : `✅ ${tr.saveAllDecisions} (${dirtyCount})`}
              </button>
            </div>
          </div>
        )}

        {eligible.length === 0 && (
          <div className="mt-4">
            <VisitDetail visit={visit} items={items} />
          </div>
        )}
      </div>
    </>
  );
}
