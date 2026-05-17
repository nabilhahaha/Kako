import { useEffect, useMemo, useState } from 'react';
import { useAuth, useLang, useToast } from '../App.jsx';
import Header from '../components/Header.jsx';
import ActionSelector from '../components/ActionSelector.jsx';
import MyVisitsTracker from '../components/MyVisitsTracker.jsx';
import { db } from '../lib/db.js';
import { useAggregatedData } from '../lib/hooks.js';
import { visitFromDb, visitItemFromDb } from '../lib/mapping.js';
import { getCustomersFor, getItemsFor } from '../lib/excel.js';
import { calcDays, daysColor, compressImage } from '../lib/utils.js';

/* Top-level page: routes between Home / Customer pick / Visit builder / Tracker. */

export default function SalesmanPage() {
  const { tr } = useLang();
  const { profile, signOut } = useAuth();
  const [view, setView] = useState('home');
  const [activeVisitId, setActiveVisitId] = useState(null);

  const { data: agg } = useAggregatedData();
  const aggData = agg?.data || {};
  const salesmanName = profile.salesman_name || profile.full_name;
  const hasExcelData = !!aggData[salesmanName];

  if (view === 'pickCustomer') {
    return (
      <>
        <Header title={tr.pickCustomer} subtitle={salesmanName} onBack={() => setView('home')} />
        {!hasExcelData ? (
          <NoDataMessage />
        ) : (
          <CustomerPicker
            aggData={aggData}
            salesmanName={salesmanName}
            onPick={async (c) => {
              try {
                const v = await db.createVisit({
                  salesman_id: profile.id,
                  salesman_name: salesmanName,
                  cust_account: c.acc,
                  cust_name: c.name,
                  status: 'draft',
                });
                setActiveVisitId(v.id);
                setView('builder');
              } catch (e) {
                alert(e.message);
              }
            }}
          />
        )}
      </>
    );
  }

  if (view === 'builder' && activeVisitId) {
    return (
      <>
        <Header
          title={tr.newVisit}
          subtitle={salesmanName}
          onBack={() => setView('home')}
        />
        <VisitBuilder
          visitId={activeVisitId}
          aggData={aggData}
          salesmanName={salesmanName}
          onSubmittedAndDone={() => {
            setActiveVisitId(null);
            setView('home');
          }}
        />
      </>
    );
  }

  if (view === 'tracker') {
    return (
      <>
        <Header
          title={tr.myVisits}
          subtitle={salesmanName}
          onBack={() => setView('home')}
        />
        <MyVisitsTracker
          onResumeDraft={(id) => {
            setActiveVisitId(id);
            setView('builder');
          }}
        />
      </>
    );
  }

  return (
    <>
      <Header subtitle={salesmanName} onLogout={signOut} />
      <SalesmanHome
        salesmanName={salesmanName}
        hasExcelData={hasExcelData}
        onStartVisit={() => setView('pickCustomer')}
        onTracker={() => setView('tracker')}
      />
    </>
  );
}

/* ───────── Home ───────── */
function SalesmanHome({ salesmanName, hasExcelData, onStartVisit, onTracker }) {
  const { tr } = useLang();
  return (
    <div className="p-4 space-y-3 fade-in">
      <div className="card p-5 bg-gradient-to-bl from-roshen-600 to-roshen-800 text-white">
        <p className="text-xs opacity-80">{tr.salesman}</p>
        <h2 className="text-xl font-bold mt-1">{salesmanName}</h2>
      </div>

      <button
        onClick={onStartVisit}
        disabled={!hasExcelData}
        className="card w-full p-5 text-start active:scale-[0.99] transition hover:shadow-md flex items-center gap-3 disabled:opacity-50"
      >
        <span className="text-3xl">🏪</span>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900">{tr.startVisit}</h3>
          <p className="text-xs text-gray-500">{tr.pickCustomer}</p>
        </div>
        <span className="text-gray-400 rtl-only">←</span>
        <span className="text-gray-400 ltr-only">→</span>
      </button>

      <button
        onClick={onTracker}
        className="card w-full p-5 text-start active:scale-[0.99] transition hover:shadow-md flex items-center gap-3"
      >
        <span className="text-3xl">📋</span>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900">{tr.myVisits}</h3>
          <p className="text-xs text-gray-500">
            {tr.drafts} · {tr.pending} · {tr.completed}
          </p>
        </div>
        <span className="text-gray-400 rtl-only">←</span>
        <span className="text-gray-400 ltr-only">→</span>
      </button>

      {!hasExcelData && (
        <div className="card p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-900">⚠️ {tr.salesmanNameNotInData}</p>
        </div>
      )}
    </div>
  );
}

function NoDataMessage() {
  const { tr } = useLang();
  return (
    <div className="p-6 text-center fade-in">
      <div className="text-5xl mb-3">📂</div>
      <p className="text-gray-600 text-sm">{tr.salesmanNameNotInData}</p>
    </div>
  );
}

/* ───────── Customer picker ───────── */
function CustomerPicker({ aggData, salesmanName, onPick }) {
  const { tr } = useLang();
  const [q, setQ] = useState('');
  const customers = useMemo(
    () => getCustomersFor(aggData, salesmanName),
    [aggData, salesmanName],
  );
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return s
      ? customers.filter(
          (c) => c.name.toLowerCase().includes(s) || c.acc.toLowerCase().includes(s),
        )
      : customers;
  }, [customers, q]);

  if (customers.length === 0) {
    return (
      <div className="p-5 text-center text-gray-500 fade-in">
        <div className="text-4xl mb-2">📭</div>
        {tr.noCustomers}
      </div>
    );
  }

  return (
    <div className="p-3 fade-in">
      <input
        type="text"
        className="input-field mb-3"
        placeholder={tr.searchCustomer}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="space-y-1.5">
        {filtered.map((c) => (
          <button
            key={c.acc}
            onClick={() => onPick(c)}
            className="card w-full p-3.5 text-start active:scale-[0.99] hover:bg-gray-50 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold shrink-0">
              🏪
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{c.name}</p>
              <p className="text-[11px] text-gray-500" dir="ltr">{c.acc}</p>
            </div>
            <span className="text-gray-300 rtl-only">←</span>
            <span className="text-gray-300 ltr-only">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────── Visit builder ───────── */
function VisitBuilder({ visitId, aggData, salesmanName, onSubmittedAndDone }) {
  const { tr, lang } = useLang();
  const { toast } = useToast();
  const [visit, setVisit] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [success, setSuccess] = useState(false);

  const reload = async () => {
    const [v, it] = await Promise.all([db.getVisit(visitId), db.listVisitItems(visitId)]);
    setVisit(visitFromDb(v));
    setItems(it.map(visitItemFromDb));
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  const handleDeleteItem = async (id) => {
    if (!confirm(tr.confirmDeleteItem)) return;
    try {
      await db.deleteVisitItem(id);
      await reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const submit = async () => {
    if (items.length === 0) {
      toast(tr.cannotSubmitEmpty, 'error');
      return;
    }
    if (!confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    setSubmitting(true);
    try {
      await db.submitVisit(visitId);
      setSuccess(true);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSubmitting(false);
      setConfirmSubmit(false);
    }
  };

  if (loading) {
    return <p className="text-center text-gray-400 py-12 text-sm">…</p>;
  }

  if (success) {
    return (
      <div className="p-6 text-center fade-in">
        <div className="text-6xl mb-3">✅</div>
        <h2 className="text-lg font-bold text-green-700">{tr.visitSubmitted}</h2>
        <p className="text-sm text-gray-500 mt-1 font-mono" dir="ltr">
          #{visitId.slice(-6)} · {items.length} items
        </p>
        <div className="space-y-2 mt-6 max-w-sm mx-auto">
          <button onClick={onSubmittedAndDone} className="btn-primary w-full">
            ✓ {tr.backToHome}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 fade-in pb-32">
      {/* Visit header card */}
      <div className="card p-3.5 bg-gray-50">
        <p className="text-[11px] text-gray-500">{tr.selectCustomer}</p>
        <p className="font-bold text-gray-900">{visit.custName}</p>
        <p className="text-[11px] text-gray-500 mt-0.5" dir="ltr">
          {visit.custAccount} · #{visit.id.slice(-6)}
        </p>
      </div>

      {/* Items list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-bold text-sm text-gray-700">
            📦 {tr.items} ({items.length})
          </h3>
        </div>

        {items.length === 0 ? (
          <div className="card p-6 text-center text-gray-400 text-sm">
            <p className="text-3xl mb-2">📦</p>
            <p>{tr.noItemsYet}</p>
          </div>
        ) : (
          items.map((it) => (
            <BuilderItemCard
              key={it.id}
              item={it}
              onEdit={() => setEditingItem(it)}
              onDelete={() => handleDeleteItem(it.id)}
            />
          ))
        )}
      </div>

      {/* Add button */}
      <button onClick={() => setShowAdd(true)} className="btn-secondary w-full text-sm">
        ➕ {tr.itemAdd}
      </button>

      {/* Submit bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-20">
        <div className="max-w-page mx-auto">
          {confirmSubmit ? (
            <div className="bg-amber-50 border-2 border-amber-300 p-3 rounded-input">
              <p className="text-sm text-amber-900 font-semibold mb-2">
                ⚠️ {tr.confirmSubmitVisit.replace('{n}', items.length)}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmSubmit(false)}
                  className="btn-secondary flex-1 text-sm"
                  disabled={submitting}
                >
                  {tr.cancel}
                </button>
                <button
                  onClick={submit}
                  className="btn-primary flex-1 text-sm"
                  disabled={submitting}
                >
                  {submitting ? '...' : tr.confirm}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={submit}
              disabled={items.length === 0 || submitting}
              className="btn-primary w-full text-base"
            >
              📤 {tr.submitVisit} {items.length > 0 && `(${items.length})`}
            </button>
          )}
        </div>
      </div>

      {(showAdd || editingItem) && (
        <AddItemModal
          aggData={aggData}
          salesmanName={salesmanName}
          custAccount={visit.custAccount}
          visitId={visit.id}
          existingItemIds={items.map((i) => i.itemId)}
          editing={editingItem}
          onClose={() => {
            setShowAdd(false);
            setEditingItem(null);
          }}
          onSaved={async () => {
            setShowAdd(false);
            setEditingItem(null);
            await reload();
          }}
        />
      )}

      {/* swallow unused lang param */}
      <span hidden>{lang}</span>
    </div>
  );
}

function BuilderItemCard({ item, onEdit, onDelete }) {
  const { tr, lang } = useLang();
  const dCol = daysColor(item.daysRemaining);
  const dayLabel =
    item.daysRemaining < 0
      ? `${tr.daysExpired} ${Math.abs(item.daysRemaining)} ${tr.daysAr}`
      : `${item.daysRemaining} ${tr.daysAr}`;
  return (
    <div className="card p-3">
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 line-clamp-2">{item.itemDesc}</p>
          <p className="text-[11px] text-gray-500 mt-0.5" dir="ltr">{item.itemId}</p>
        </div>
        {(item.photoExpiryPath || item.photoQtyPath) && (
          <span className="text-[10px] text-green-700 font-semibold">📷</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: dCol.bg, color: dCol.fg }}
        >
          {dayLabel}
        </span>
        <span className="text-[11px] text-gray-500">
          {item.physQty} / {item.netQty} {tr.cases}
        </span>
      </div>

      <div className="flex gap-2">
        <button onClick={onEdit} className="btn-ghost text-xs border border-gray-200 flex-1">
          ✏️ {tr.edit}
        </button>
        <button onClick={onDelete} className="btn-ghost text-xs border border-red-200 text-red-700">
          🗑
        </button>
      </div>
      <span hidden>{lang}</span>
    </div>
  );
}

/* ───────── Add / Edit item modal ───────── */
function AddItemModal({
  aggData,
  salesmanName,
  custAccount,
  visitId,
  existingItemIds,
  editing,
  onClose,
  onSaved,
}) {
  const { tr } = useLang();
  const { toast } = useToast();

  const allItems = useMemo(
    () => getItemsFor(aggData, salesmanName, custAccount),
    [aggData, salesmanName, custAccount],
  );

  // If editing, pre-fill with the existing item's source row.
  const initialItem = editing
    ? allItems.find((it) => it.id === editing.itemId) || {
        id: editing.itemId,
        desc: editing.itemDesc,
        qty: editing.netQty,
      }
    : null;

  const [picked, setPicked] = useState(initialItem);
  const [q, setQ] = useState('');
  const [physQty, setPhysQty] = useState(editing ? String(editing.physQty) : '');
  const [expiryDate, setExpiryDate] = useState(editing?.expiryDate || '');
  const [expiryPhoto, setExpiryPhoto] = useState(null);
  const [qtyPhoto, setQtyPhoto] = useState(null);
  const [suggestion, setSuggestion] = useState(editing?.salesmanSuggestion || '');
  const [notes, setNotes] = useState(editing?.salesmanNotes || '');
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    const available = allItems.filter((it) => !existingItemIds.includes(it.id) || it.id === editing?.itemId);
    return s
      ? available.filter(
          (it) =>
            it.desc.toLowerCase().includes(s) || it.id.toLowerCase().includes(s),
        )
      : available;
  }, [allItems, q, existingItemIds, editing]);

  const daysRemaining = expiryDate ? calcDays(expiryDate) : null;
  const dCol = daysRemaining !== null ? daysColor(daysRemaining) : null;
  const dayLabel =
    daysRemaining === null
      ? ''
      : daysRemaining < 0
      ? `${tr.daysExpired} ${Math.abs(daysRemaining)} ${tr.daysAr}`
      : `${daysRemaining} ${tr.daysAr}`;

  const physQtyN = parseFloat(physQty);
  const isValid =
    picked &&
    !isNaN(physQtyN) &&
    physQtyN > 0 &&
    expiryDate &&
    // For new items both photos required; for edits, keep existing if not re-taken
    (editing ? true : expiryPhoto && qtyPhoto) &&
    suggestion;

  const save = async () => {
    if (!isValid) {
      toast(tr.fillAllFields, 'error');
      return;
    }
    setSubmitting(true);
    try {
      // Upload any new photos.
      let photoExpiryPath = editing?.photoExpiryPath || null;
      let photoQtyPath = editing?.photoQtyPath || null;

      if (expiryPhoto) {
        photoExpiryPath = await db.uploadItemPhoto(visitId, picked.id, 'expiry', expiryPhoto);
      }
      if (qtyPhoto) {
        photoQtyPath = await db.uploadItemPhoto(visitId, picked.id, 'qty', qtyPhoto);
      }

      const payload = {
        visit_id: visitId,
        item_id: picked.id,
        item_desc: picked.desc,
        net_qty: picked.qty,
        phys_qty: physQtyN,
        expiry_date: expiryDate,
        days_remaining: daysRemaining,
        salesman_suggestion: suggestion,
        salesman_notes: notes.trim() || null,
        photo_expiry_path: photoExpiryPath,
        photo_qty_path: photoQtyPath,
        item_status: 'pending_tm',
      };

      if (editing) {
        await db.updateVisitItem(editing.id, payload);
      } else {
        await db.createVisitItem(payload);
      }
      onSaved();
    } catch (e) {
      console.error(e);
      toast(e.message || 'Error', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="card w-full max-w-page max-h-[92vh] overflow-y-auto fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between rounded-t-card z-10">
          <h2 className="font-bold">{editing ? `✏️ ${tr.edit}` : `➕ ${tr.itemAdd}`}</h2>
          <button
            onClick={onClose}
            className="bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="p-3 space-y-3">
          {!picked ? (
            <>
              <h3 className="text-xs font-semibold text-gray-700 px-1">{tr.selectItem}</h3>
              <input
                type="text"
                className="input-field"
                placeholder={tr.searchItem}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {filtered.length === 0 ? (
                <p className="text-center text-gray-500 py-8 text-sm">{tr.noItems}</p>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map((it) => (
                    <button
                      key={it.id}
                      onClick={() => setPicked(it)}
                      className="card w-full p-3 text-start active:scale-[0.99] hover:bg-gray-50 flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        📦
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-xs line-clamp-2">{it.desc}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5" dir="ltr">{it.id}</p>
                      </div>
                      <span className="shrink-0 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                        {it.qty}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {!editing && (
                <button onClick={() => setPicked(null)} className="btn-ghost text-xs">
                  ← {tr.back}
                </button>
              )}

              <div className="card p-3 bg-gray-50">
                <p className="font-bold text-gray-900 text-sm leading-snug">{picked.desc}</p>
                <p className="text-[11px] text-gray-500 mt-1" dir="ltr">{picked.id}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-600">{tr.systemQty}:</span>
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
                    {picked.qty} {tr.cases}
                  </span>
                </div>
              </div>

              <label className="card p-3 block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">
                  {tr.physicalQty} ({tr.cases})
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  className="input-field"
                  value={physQty}
                  onChange={(e) => setPhysQty(e.target.value)}
                  placeholder="0"
                />
              </label>

              <label className="card p-3 block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">{tr.expiryDate}</span>
                <input
                  type="date"
                  className="input-field"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
                {dCol && (
                  <div className="mt-2">
                    <span
                      className="inline-block text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ background: dCol.bg, color: dCol.fg }}
                    >
                      📅 {dayLabel}
                    </span>
                  </div>
                )}
              </label>

              <div className="grid grid-cols-2 gap-2">
                <PhotoCapture
                  label={tr.expiryPhoto}
                  icon="📅"
                  dataUrl={expiryPhoto}
                  existing={!!editing?.photoExpiryPath}
                  onCapture={setExpiryPhoto}
                />
                <PhotoCapture
                  label={tr.qtyPhoto}
                  icon="📦"
                  dataUrl={qtyPhoto}
                  existing={!!editing?.photoQtyPath}
                  onCapture={setQtyPhoto}
                />
              </div>

              <div className="card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-gray-700">{tr.suggestedAction}</span>
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                    {tr.advisoryOnly}
                  </span>
                </div>
                <ActionSelector value={suggestion} onChange={setSuggestion} />
              </div>

              <label className="card p-3 block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">{tr.salesmanNotes}</span>
                <textarea
                  className="input-field"
                  rows={2}
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={tr.notesPlaceholder}
                />
              </label>

              <button
                onClick={save}
                disabled={!isValid || submitting}
                className="btn-primary w-full"
              >
                {submitting ? '...' : `💾 ${tr.saveItem}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── Photo capture ───────── */
function PhotoCapture({ label, icon, dataUrl, existing, onCapture }) {
  const { tr } = useLang();
  const [loading, setLoading] = useState(false);
  const inputId = `photo-${label}`;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const compressed = await compressImage(file);
      onCapture(compressed);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const display = dataUrl;
  const showExisting = !dataUrl && existing;

  return (
    <div className="card p-2">
      <span className="text-[11px] font-semibold text-gray-600 block mb-1.5 truncate">
        {icon} {label}
      </span>
      <label htmlFor={inputId} className="block cursor-pointer">
        {display ? (
          <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
            <img src={display} alt="" className="w-full h-full object-cover" />
          </div>
        ) : showExisting ? (
          <div className="aspect-square rounded-lg bg-green-50 border border-green-200 flex flex-col items-center justify-center text-green-700">
            <span className="text-2xl">✓</span>
            <span className="text-[10px] mt-1 font-semibold">{tr.retake}</span>
          </div>
        ) : (
          <div className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-roshen-500 hover:text-roshen-600 transition">
            <span className="text-2xl">{loading ? '...' : '📸'}</span>
            <span className="text-[11px] mt-1 font-semibold">{tr.takePhoto}</span>
          </div>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}
