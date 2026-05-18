import { useEffect, useMemo, useState } from 'react';
import { useAuth, useLang, useToast } from '../App.jsx';
import { db } from '../lib/db.js';
import { visitFromDb, visitItemFromDb } from '../lib/mapping.js';
import { calcDays, daysColor, fmtDate, fmtDateTime, compressImage } from '../lib/utils.js';
import { ACTION_CODES, ACTION_LABELS, ACTION_COLORS } from '../lib/actions.js';

const VAN_STOCK_PREFIX = 'Van Stock - ';

// Calls the parent when the user wants to leave.
//
// Lifecycle:
//   1. fetchOrCreateVisit() — find an existing draft van_stock visit for
//      this salesman + warehouse, or create one.
//   2. List the salesman's van stock (latest upload) sorted by days remaining.
//   3. Each card opens a small "add to visit" modal which inserts a
//      visit_item linked to the draft visit.
//   4. Bottom "Submit visit" promotes the visit from draft -> pending_tm,
//      reusing the existing TM/RM/PDF/email pipeline.
export default function VanStockBuilder({ onDone }) {
  const { tr, lang } = useLang();
  const { profile, user } = useAuth();
  const { toast } = useToast();

  const salesmanName = profile.salesman_name || profile.full_name;
  const warehouse = profile.warehouse_code || null;

  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState([]);
  const [visit, setVisit] = useState(null);
  const [items, setItems] = useState([]);
  const [lastUpload, setLastUpload] = useState(null);
  const [filter, setFilter] = useState('all'); // all | critical | warning | safe
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // van-stock row currently in modal
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [success, setSuccess] = useState(false);

  /* ─── Bootstrap ─── */
  useEffect(() => {
    let active = true;
    (async () => {
      if (!warehouse) {
        setLoading(false);
        return;
      }
      try {
        const [vStock, lastUp, myVisits] = await Promise.all([
          db.listMyVanStock(warehouse),
          db.getLatestVanUpload(),
          db.listMyVisits(user.id),
        ]);
        if (!active) return;
        setStock(vStock);
        setLastUpload(lastUp);

        // Re-use any open draft van_stock visit for this warehouse.
        // myVisits comes from db.listMyVisits() which returns raw DB rows
        // (snake_case). visit_type may be missing if the migration hasn't run.
        const draft = myVisits.find(
          (v) =>
            v.status === 'draft' &&
            (v.visit_type || 'customer') === 'van_stock' &&
            v.cust_account === warehouse,
        );
        if (draft) {
          const dItems = await db.listVisitItems(draft.id);
          if (!active) return;
          setVisit(visitFromDb(draft));
          setItems(dItems.map(visitItemFromDb));
        } else {
          const created = await db.createVisit({
            salesman_id: user.id,
            salesman_name: salesmanName,
            cust_account: warehouse,
            cust_name: `${VAN_STOCK_PREFIX}${salesmanName}`,
            status: 'draft',
            visit_type: 'van_stock',
          });
          if (!active) return;
          setVisit(visitFromDb(created));
          setItems([]);
        }
      } catch (e) {
        console.error(e);
        toast(e.message || 'Error', 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouse]);

  const reloadItems = async () => {
    if (!visit) return;
    const dItems = await db.listVisitItems(visit.id);
    setItems(dItems.map(visitItemFromDb));
  };

  const addedItemIds = useMemo(
    () => new Set(items.map((i) => i.itemId)),
    [items],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return stock.filter((row) => {
      const days = calcDays(row.expiry_date);
      if (filter === 'critical' && !(days < 60)) return false;
      if (filter === 'warning' && !(days >= 60 && days <= 120)) return false;
      if (filter === 'safe' && !(days > 120)) return false;
      if (term) {
        const t = (row.item_name + ' ' + row.item_number).toLowerCase();
        if (!t.includes(term)) return false;
      }
      return true;
    });
  }, [stock, filter, q]);

  const criticalCount = useMemo(
    () => stock.filter((r) => calcDays(r.expiry_date) < 60).length,
    [stock],
  );

  const lastUploadAgeDays = lastUpload?.uploaded_at ? -calcDays(lastUpload.uploaded_at) : null;

  /* ─── Submit ─── */
  const submit = async () => {
    if (!visit || items.length === 0) {
      toast(tr.cannotSubmitEmpty, 'error');
      return;
    }
    if (!confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    setSubmitting(true);
    try {
      await db.submitVisit(visit.id);
      setSuccess(true);
    } catch (e) {
      console.error(e);
      toast(e.message, 'error');
    } finally {
      setSubmitting(false);
      setConfirmSubmit(false);
    }
  };

  if (!warehouse) {
    return (
      <div className="p-5 text-center fade-in">
        <div className="text-5xl mb-3">⚠️</div>
        <p className="text-sm text-gray-600">{tr.vanNoWarehouse}</p>
        <button onClick={onDone} className="btn-secondary mt-4">
          ← {tr.back}
        </button>
      </div>
    );
  }
  if (loading || !visit) {
    return <p className="text-center text-gray-400 py-12 text-sm">…</p>;
  }
  if (success) {
    return (
      <div className="p-6 text-center fade-in">
        <div className="text-6xl mb-3">✅</div>
        <h2 className="text-lg font-bold text-green-700">{tr.visitSubmitted}</h2>
        <p className="text-sm text-gray-500 mt-1 font-mono" dir="ltr">
          #{visit.id.slice(-6)} · {items.length} items
        </p>
        <div className="space-y-2 mt-6 max-w-sm mx-auto">
          <button onClick={onDone} className="btn-primary w-full">
            ✓ {tr.backToHome}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 fade-in pb-32">
      {/* Header summary */}
      <div className="card p-3.5 bg-blue-50 border-blue-200">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base text-blue-900">🚐 {tr.myVanStock}</h2>
            <p className="text-[11px] text-blue-700 mt-0.5" dir="ltr">
              {salesmanName} · {warehouse}
            </p>
          </div>
          <span className="text-[11px] bg-white text-blue-700 font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
            {tr.vanItemsCount.replace('{n}', stock.length)}
          </span>
        </div>
        {criticalCount > 0 && (
          <p className="text-[11px] text-red-700 font-semibold mt-1">
            🔴 {tr.vanCriticalCount.replace('{n}', criticalCount)}
          </p>
        )}
        {lastUpload && (
          <p className="text-[10px] text-blue-600 mt-1">
            {tr.vanLastUploadAt}: {fmtDateTime(lastUpload.uploaded_at, lang)}
            {lastUploadAgeDays > 1 && (
              <span className="ms-1 text-amber-700 font-semibold">
                · {tr.vanDataAgeDays.replace('{n}', lastUploadAgeDays)}
              </span>
            )}
          </p>
        )}
        {!lastUpload && (
          <p className="text-[10px] text-amber-700 font-semibold mt-1">
            ⚠️ {tr.vanNoUploadYet}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip value="all"      current={filter} onChange={setFilter} label={tr.vanFilterAll} />
        <FilterChip value="critical" current={filter} onChange={setFilter} label={tr.vanFilterCritical} tone="red" />
        <FilterChip value="warning"  current={filter} onChange={setFilter} label={tr.vanFilterWarning} tone="amber" />
        <FilterChip value="safe"     current={filter} onChange={setFilter} label={tr.vanFilterSafe} tone="green" />
      </div>

      <input
        type="text"
        className="input-field"
        placeholder={tr.searchItem}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {/* Stock list */}
      {stock.length === 0 ? (
        <div className="card p-6 text-center text-gray-400 text-sm">
          <p className="text-3xl mb-2">📭</p>
          <p>{tr.vanEmptyStock}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const added = addedItemIds.has(row.item_number);
            const visitItem = items.find((i) => i.itemId === row.item_number);
            return (
              <StockCard
                key={row.id}
                row={row}
                added={added}
                visitItem={visitItem}
                onTap={() => setEditing({ row, existing: visitItem })}
              />
            );
          })}
        </div>
      )}

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

      {/* Edit modal */}
      {editing && (
        <VanItemModal
          row={editing.row}
          existing={editing.existing}
          visit={visit}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reloadItems();
          }}
          onRemoved={async () => {
            setEditing(null);
            await reloadItems();
          }}
        />
      )}
    </div>
  );
}

/* ─── Stock card ─── */
function StockCard({ row, added, visitItem, onTap }) {
  const { tr, lang } = useLang();
  const days = calcDays(row.expiry_date);
  const dCol = daysColor(days);
  const dayLabel =
    days < 0
      ? `${tr.daysExpired} ${Math.abs(days)} ${tr.daysAr}`
      : `${days} ${tr.daysAr}`;

  // Tint the whole card with a soft tone.
  let bg = '#ffffff';
  if (days < 60) bg = '#fee2e2';
  else if (days <= 120) bg = '#ffedd5';
  else bg = '#dcfce7';

  return (
    <button
      onClick={onTap}
      className="card w-full p-3 text-start active:scale-[0.99] transition hover:shadow-md"
      style={{ background: bg }}
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 line-clamp-2">{row.item_name}</p>
          <p className="text-[11px] text-gray-500 mt-0.5" dir="ltr">{row.item_number}{row.batch_number ? ` · batch ${row.batch_number}` : ''}</p>
        </div>
        {added && (
          <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full whitespace-nowrap">
            ✓ {tr.vanItemSelected}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span
          className="font-semibold px-2 py-0.5 rounded-full"
          style={{ background: dCol.bg, color: dCol.fg }}
        >
          📅 {dayLabel} · {fmtDate(row.expiry_date, lang)}
        </span>
        <span className="text-gray-700 font-semibold">
          {row.available_qty} {row.sk_unit || ''}
        </span>
        {visitItem?.salesmanSuggestion && (
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: ACTION_COLORS[visitItem.salesmanSuggestion].bg,
              color: ACTION_COLORS[visitItem.salesmanSuggestion].fg,
            }}
          >
            {ACTION_LABELS[visitItem.salesmanSuggestion][lang]}
          </span>
        )}
      </div>
    </button>
  );
}

/* ─── Filter chip ─── */
function FilterChip({ value, current, onChange, label, tone }) {
  const active = current === value;
  const toneCls = !active
    ? 'bg-white text-gray-600 border-gray-200'
    : tone === 'red'   ? 'bg-red-100 text-red-700 border-red-300'
    : tone === 'amber' ? 'bg-amber-100 text-amber-800 border-amber-300'
    : tone === 'green' ? 'bg-green-100 text-green-700 border-green-300'
    : 'bg-roshen-100 text-roshen-700 border-roshen-300';
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition ${toneCls}`}
    >
      {label}
    </button>
  );
}

/* ─── Add/Edit-item modal ─── */
function VanItemModal({ row, existing, visit, onClose, onSaved, onRemoved }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const days = calcDays(row.expiry_date);

  const [physQty, setPhysQty] = useState(
    existing ? String(existing.physQty) : String(row.available_qty ?? ''),
  );
  const [suggestion, setSuggestion] = useState(existing?.salesmanSuggestion || '');
  const [notes, setNotes] = useState(existing?.salesmanNotes || '');
  const [expiryPhoto, setExpiryPhoto] = useState(null);
  const [qtyPhoto, setQtyPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const physQtyN = parseFloat(physQty);
  const isValid = !isNaN(physQtyN) && physQtyN > 0 && suggestion;

  const save = async () => {
    if (!isValid) {
      toast(tr.fillAllFields, 'error');
      return;
    }
    setSubmitting(true);
    try {
      let photoExpiryPath = existing?.photoExpiryPath || null;
      let photoQtyPath = existing?.photoQtyPath || null;
      if (expiryPhoto) photoExpiryPath = await db.uploadItemPhoto(visit.id, row.item_number, 'expiry', expiryPhoto);
      if (qtyPhoto)    photoQtyPath    = await db.uploadItemPhoto(visit.id, row.item_number, 'qty',    qtyPhoto);

      const payload = {
        visit_id: visit.id,
        item_id: row.item_number,
        item_desc: row.item_name,
        net_qty: row.available_qty,
        phys_qty: physQtyN,
        expiry_date: row.expiry_date,
        days_remaining: days,
        salesman_suggestion: suggestion,
        salesman_notes: notes.trim() || null,
        photo_expiry_path: photoExpiryPath,
        photo_qty_path: photoQtyPath,
        item_status: 'pending_tm',
      };
      if (existing) await db.updateVisitItem(existing.id, payload);
      else          await db.createVisitItem(payload);
      onSaved();
    } catch (e) {
      console.error(e);
      toast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm(tr.confirmDeleteItem)) return;
    try {
      await db.deleteVisitItem(existing.id);
      onRemoved();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="card w-full max-w-page max-h-[92vh] overflow-y-auto fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between rounded-t-card z-10">
          <h2 className="font-bold">{existing ? `✏️ ${tr.edit}` : `➕ ${tr.itemAdd}`}</h2>
          <button onClick={onClose} className="bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center">
            ✕
          </button>
        </div>
        <div className="p-3 space-y-3">
          <div className="card p-3 bg-gray-50">
            <p className="font-bold text-sm text-gray-900 leading-snug">{row.item_name}</p>
            <p className="text-[11px] text-gray-500 mt-1" dir="ltr">{row.item_number}</p>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-gray-600">Available:</span>
              <span className="font-bold">{row.available_qty} {row.sk_unit || ''}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-gray-600">{tr.expiryDate}:</span>
              <span className="font-bold">{row.expiry_date} ({days}d)</span>
            </div>
          </div>

          <label className="card p-3 block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">
              {tr.physicalQty} ({row.sk_unit || tr.cases})
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className="input-field"
              value={physQty}
              onChange={(e) => setPhysQty(e.target.value)}
            />
          </label>

          <div className="card p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-700">{tr.suggestedAction}</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {ACTION_CODES.map((code) => {
                const sel = suggestion === code;
                const c = ACTION_COLORS[code];
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setSuggestion(code)}
                    className="flex items-center gap-2 rounded-input border-2 px-3 py-2 transition active:scale-[0.99]"
                    style={{
                      background: sel ? c.bg : '#ffffff',
                      borderColor: sel ? c.border : '#e5e7eb',
                    }}
                  >
                    <span
                      className="w-4 h-4 rounded-full border-2 shrink-0"
                      style={{
                        borderColor: sel ? c.fg : '#9ca3af',
                        background: sel ? c.fg : 'white',
                      }}
                    />
                    <span className="text-sm font-semibold text-start" style={{ color: c.fg }}>
                      {ACTION_LABELS[code].en}
                    </span>
                  </button>
                );
              })}
            </div>
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

          {/* Photos optional */}
          <div className="grid grid-cols-2 gap-2">
            <PhotoCell label={tr.expiryPhoto} icon="📅" dataUrl={expiryPhoto} existing={!!existing?.photoExpiryPath} onCapture={setExpiryPhoto} />
            <PhotoCell label={tr.qtyPhoto} icon="📦" dataUrl={qtyPhoto} existing={!!existing?.photoQtyPath} onCapture={setQtyPhoto} />
          </div>

          <div className="flex gap-2">
            {existing && (
              <button onClick={remove} className="btn-ghost border border-red-200 text-red-700">
                🗑
              </button>
            )}
            <button onClick={onClose} className="btn-secondary flex-1">{tr.cancel}</button>
            <button onClick={save} disabled={!isValid || submitting} className="btn-primary flex-1">
              {submitting ? '...' : `💾 ${tr.saveItem}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhotoCell({ label, icon, dataUrl, existing, onCapture }) {
  const { tr } = useLang();
  const [loading, setLoading] = useState(false);
  const inputId = `vphoto-${label}`;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const compressed = await compressImage(file);
      onCapture(compressed);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="card p-2">
      <span className="text-[11px] font-semibold text-gray-600 block mb-1.5 truncate">
        {icon} {label}
      </span>
      <label htmlFor={inputId} className="block cursor-pointer">
        {dataUrl ? (
          <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
            <img src={dataUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : existing ? (
          <div className="aspect-square rounded-lg bg-green-50 border border-green-200 flex flex-col items-center justify-center text-green-700">
            <span className="text-2xl">✓</span>
            <span className="text-[10px] mt-1 font-semibold">{tr.retake}</span>
          </div>
        ) : (
          <div className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400">
            <span className="text-2xl">{loading ? '...' : '📸'}</span>
            <span className="text-[11px] mt-1 font-semibold">{tr.takePhoto}</span>
          </div>
        )}
      </label>
      <input id={inputId} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
    </div>
  );
}
