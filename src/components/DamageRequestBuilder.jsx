import { useEffect, useMemo, useState } from 'react';
import { useAuth, useLang, useToast } from '../App.jsx';
import { db } from '../lib/db.js';
import { useAggregatedData } from '../lib/hooks.js';
import { getCustomersFor, getItemsFor } from '../lib/excel.js';
import { compressImage } from '../lib/utils.js';

// Salesman-side damage-request builder. Steps:
//   1. Pick source: 'van' or 'customer'.
//   2. If customer: pick a customer (same picker shape as Near Expiry).
//   3. Pick items from that source (van_stock rows, or aggregated_data items).
//   4. For each picked item: damaged quantity, optional note, optional photo.
//   5. Submit → INSERT damage_request + bulk INSERT damage_request_items
//      (status='submitted').
//
// Item-source reuse:
//   - Van path uses db.listMyVanStock(warehouseCode) — same data as the
//     existing VanStockBuilder.
//   - Customer path uses getCustomersFor / getItemsFor over aggregated_data
//     from useAggregatedData — same data as the Near Expiry visit-builder.
export default function DamageRequestBuilder({ onDone }) {
  const { tr } = useLang();
  const { profile, user } = useAuth();
  const { toast } = useToast();

  const salesmanName = profile.salesman_name || profile.full_name;
  const warehouse = profile.warehouse_code || null;

  const { data: agg } = useAggregatedData();
  const aggData = agg?.data || {};

  const [source, setSource] = useState('van'); // 'van' | 'customer'
  const [customer, setCustomer] = useState(null);

  // selected[itemNumber] = { item, quantity, unit, notes, photo }
  const [selected, setSelected] = useState({});

  const [vanStock, setVanStock] = useState([]);
  const [loadingVan, setLoadingVan] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [confirmStage, setConfirmStage] = useState(false);
  const [success, setSuccess] = useState(null);

  // Load van stock when source = 'van' and we have a warehouse.
  useEffect(() => {
    if (source !== 'van' || !warehouse) return;
    let active = true;
    setLoadingVan(true);
    db.listMyVanStock(warehouse)
      .then((rows) => {
        if (!active) return;
        setVanStock(rows);
      })
      .finally(() => active && setLoadingVan(false));
    return () => {
      active = false;
    };
  }, [source, warehouse]);

  const selectedItems = Object.values(selected);

  const switchSource = (next) => {
    if (next === source) return;
    setSource(next);
    setCustomer(null);
    setSelected({});
  };

  const toggleItem = (item) => {
    setSelected((prev) => {
      const key = item.item_number || item.id;
      if (prev[key]) {
        const { [key]: _omit, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [key]: {
          item,
          quantity: '',
          notes: '',
          photo: null,
          unit: item.sk_unit || '',
        },
      };
    });
  };

  const updateSelected = (key, patch) =>
    setSelected((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const removeSelected = (key) =>
    setSelected((prev) => {
      const { [key]: _omit, ...rest } = prev;
      return rest;
    });

  // Validation: each picked item needs quantity > 0; source must be set;
  // for customer source, a customer must be picked.
  const isValid =
    selectedItems.length > 0 &&
    selectedItems.every((s) => {
      const q = parseFloat(s.quantity);
      return !isNaN(q) && q > 0;
    }) &&
    (source === 'van' ? !!warehouse : !!customer);

  const submit = async () => {
    if (!isValid) {
      toast(tr.fillAllFields, 'error');
      return;
    }
    if (!confirmStage) {
      setConfirmStage(true);
      return;
    }
    setSubmitting(true);
    try {
      const req = await db.createDamageRequest({
        salesman_id: user.id,
        salesman_name: salesmanName,
        source_type: source,
        cust_account: source === 'customer' ? customer.acc : null,
        cust_name: source === 'customer' ? customer.name : null,
        status: 'submitted',
      });

      // Upload photos in parallel, capturing per-item failures non-fatally.
      const itemRows = await Promise.all(
        selectedItems.map(async (s, i) => {
          let photoUrl = null;
          if (s.photo) {
            try {
              photoUrl = await db.uploadDamagePhoto(req.id, i, s.photo);
            } catch (e) {
              console.warn('damage photo upload failed', e);
              toast(`Photo for item ${i + 1} failed to upload`, 'error');
            }
          }
          return {
            damage_request_id: req.id,
            item_number: s.item.item_number || s.item.id,
            item_name: s.item.item_name || s.item.desc || s.item.item_number,
            quantity: parseFloat(s.quantity),
            unit: s.unit || null,
            photo_url: photoUrl,
            notes: s.notes?.trim() || null,
          };
        }),
      );
      await db.bulkInsertDamageItems(itemRows);

      setSuccess({ id: req.id, count: itemRows.length });
      setSelected({});
    } catch (e) {
      console.error(e);
      toast(e.message || 'Error', 'error');
    } finally {
      setSubmitting(false);
      setConfirmStage(false);
    }
  };

  /* ─── Success state ─── */
  if (success) {
    return (
      <div className="p-6 text-center fade-in">
        <div className="text-6xl mb-3">✅</div>
        <h2 className="text-lg font-bold text-green-700">{tr.damageSubmitted}</h2>
        <p className="text-sm text-gray-500 mt-1 font-mono" dir="ltr">
          #{success.id.slice(-6)} · {success.count} items
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
      {/* Source toggle */}
      <div className="flex p-1 bg-gray-100 rounded-input gap-1">
        <SourceTab value="van"      current={source} onChange={switchSource} label={tr.damageSourceVan} />
        <SourceTab value="customer" current={source} onChange={switchSource} label={tr.damageSourceCustomer} />
      </div>

      {source === 'van' ? (
        <VanItemPicker
          warehouse={warehouse}
          stock={vanStock}
          loading={loadingVan}
          selected={selected}
          onToggle={toggleItem}
        />
      ) : !customer ? (
        <CustomerPickerSlim
          aggData={aggData}
          salesmanName={salesmanName}
          onPick={setCustomer}
        />
      ) : (
        <CustomerItemPicker
          aggData={aggData}
          salesmanName={salesmanName}
          customer={customer}
          onClearCustomer={() => setCustomer(null)}
          selected={selected}
          onToggle={toggleItem}
        />
      )}

      {/* Selected items editor */}
      {selectedItems.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="font-bold text-sm text-gray-700 px-1">
            {tr.damageItems} ({selectedItems.length})
          </h3>
          {selectedItems.map((s) => {
            const key = s.item.item_number || s.item.id;
            return (
              <DamageItemEditor
                key={key}
                state={s}
                onChange={(patch) => updateSelected(key, patch)}
                onRemove={() => removeSelected(key)}
              />
            );
          })}
        </div>
      )}

      {/* Submit bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-20">
        <div className="max-w-page mx-auto">
          {confirmStage ? (
            <div className="bg-amber-50 border-2 border-amber-300 p-3 rounded-input">
              <p className="text-sm text-amber-900 font-semibold mb-2">
                ⚠️ {tr.confirmSubmitDamage.replace('{n}', selectedItems.length)}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmStage(false)}
                  className="btn-secondary flex-1 text-sm"
                  disabled={submitting}
                >
                  {tr.cancel}
                </button>
                <button onClick={submit} className="btn-primary flex-1 text-sm" disabled={submitting}>
                  {submitting ? '...' : tr.confirm}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={submit}
              disabled={!isValid || submitting}
              className="btn-primary w-full text-base"
            >
              📤 {tr.submitDamage} {selectedItems.length > 0 && `(${selectedItems.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── Source toggle tab ───────── */
function SourceTab({ value, current, onChange, label }) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`flex-1 py-2 text-xs font-semibold rounded-md transition ${
        active ? 'bg-white text-roshen-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );
}

/* ───────── Van source picker ───────── */
function VanItemPicker({ warehouse, stock, loading, selected, onToggle }) {
  const { tr } = useLang();
  const [q, setQ] = useState('');

  if (!warehouse) {
    return (
      <div className="card p-6 text-center text-gray-500 text-sm fade-in">
        <p className="text-3xl mb-2">⚠️</p>
        <p>{tr.vanNoWarehouse}</p>
      </div>
    );
  }
  if (loading) {
    return <p className="text-center text-gray-400 py-8 text-sm">…</p>;
  }
  if (stock.length === 0) {
    return (
      <div className="card p-6 text-center text-gray-500 text-sm">
        <p className="text-3xl mb-2">📭</p>
        <p>{tr.vanEmptyStock}</p>
      </div>
    );
  }

  const filtered = stock.filter((r) => {
    if (!q) return true;
    const t = (r.item_name + ' ' + r.item_number).toLowerCase();
    return t.includes(q.toLowerCase());
  });

  return (
    <>
      <input
        type="text"
        className="input-field"
        placeholder={tr.searchItem}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="space-y-1.5">
        {filtered.map((row) => (
          <PickItemRow
            key={row.id}
            primary={row.item_name}
            secondary={`${row.item_number} · ${row.available_qty} ${row.sk_unit || ''}`}
            isSelected={!!selected[row.item_number]}
            onToggle={() => onToggle(row)}
          />
        ))}
      </div>
    </>
  );
}

/* ───────── Customer picker (same shape as Near Expiry) ───────── */
function CustomerPickerSlim({ aggData, salesmanName, onPick }) {
  const { tr } = useLang();
  const [q, setQ] = useState('');
  const customers = useMemo(
    () => getCustomersFor(aggData, salesmanName),
    [aggData, salesmanName],
  );
  if (customers.length === 0) {
    return (
      <div className="card p-6 text-center text-gray-500 text-sm">
        <p>{tr.noCustomers}</p>
      </div>
    );
  }
  const filtered = q
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q.toLowerCase()) ||
          c.acc.toLowerCase().includes(q.toLowerCase()),
      )
    : customers;
  return (
    <>
      <input
        type="text"
        className="input-field"
        placeholder={tr.searchCustomer}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="space-y-1.5">
        {filtered.map((c) => (
          <button
            key={c.acc}
            onClick={() => onPick(c)}
            className="card w-full p-3 text-start active:scale-[0.99] hover:bg-gray-50 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold shrink-0">🏪</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{c.name}</p>
              <p className="text-[11px] text-gray-500" dir="ltr">{c.acc}</p>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

/* ───────── Customer source — items picker (same source as Near Expiry) ───────── */
function CustomerItemPicker({ aggData, salesmanName, customer, onClearCustomer, selected, onToggle }) {
  const { tr } = useLang();
  const [q, setQ] = useState('');
  const items = useMemo(
    () => getItemsFor(aggData, salesmanName, customer.acc),
    [aggData, salesmanName, customer],
  );
  const filtered = q
    ? items.filter(
        (it) =>
          it.desc.toLowerCase().includes(q.toLowerCase()) ||
          it.id.toLowerCase().includes(q.toLowerCase()),
      )
    : items;

  return (
    <>
      <div className="card p-3 flex items-center gap-2 bg-cyan-50">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-cyan-700">{tr.selectCustomer}</p>
          <p className="font-semibold text-sm truncate">{customer.name}</p>
          <p className="text-[10px] text-gray-500" dir="ltr">{customer.acc}</p>
        </div>
        <button onClick={onClearCustomer} className="btn-ghost text-xs">
          {tr.back}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-center text-gray-500 py-8 text-sm">{tr.damageNoItemsForCustomer}</p>
      ) : (
        <>
          <input
            type="text"
            className="input-field"
            placeholder={tr.searchItem}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="space-y-1.5">
            {filtered.map((it) => {
              // Normalize to the same shape the van source uses so selected[]
              // can key off item_number.
              const normalized = {
                item_number: it.id,
                item_name: it.desc,
                sk_unit: '',
              };
              return (
                <PickItemRow
                  key={it.id}
                  primary={it.desc}
                  secondary={`${it.id} · ${it.qty} cases`}
                  isSelected={!!selected[it.id]}
                  onToggle={() => onToggle(normalized)}
                />
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/* ───────── A single item row with select/deselect ───────── */
function PickItemRow({ primary, secondary, isSelected, onToggle }) {
  const { tr } = useLang();
  return (
    <button
      onClick={onToggle}
      className={`card w-full p-3 text-start active:scale-[0.99] flex items-center gap-3 transition ${
        isSelected ? 'bg-green-50 border-green-300' : 'hover:bg-gray-50'
      }`}
    >
      <div
        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
          isSelected ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 bg-white'
        }`}
      >
        {isSelected ? '✓' : ''}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm line-clamp-2">{primary}</p>
        <p className="text-[11px] text-gray-500 truncate" dir="ltr">{secondary}</p>
      </div>
      {isSelected && (
        <span className="text-[10px] font-semibold text-green-700">{tr.damageAddedItem}</span>
      )}
    </button>
  );
}

/* ───────── Editor for each selected item ───────── */
function DamageItemEditor({ state, onChange, onRemove }) {
  const { tr } = useLang();
  const item = state.item;
  return (
    <div className="card p-3 space-y-2 bg-red-50 border-red-200">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 line-clamp-2">
            {item.item_name || item.desc}
          </p>
          <p className="text-[11px] text-gray-500" dir="ltr">{item.item_number || item.id}</p>
        </div>
        <button onClick={onRemove} className="btn-ghost text-xs text-red-700">🗑</button>
      </div>
      <label className="block">
        <span className="block text-xs font-semibold text-gray-600 mb-1">{tr.damagedQty}</span>
        <input
          type="number"
          inputMode="decimal"
          min="0.01"
          step="any"
          className="input-field"
          value={state.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
          placeholder="0"
          style={{ fontSize: '16px' }}
        />
      </label>
      <DamagePhotoInput
        dataUrl={state.photo}
        onCapture={(p) => onChange({ photo: p })}
      />
      <label className="block">
        <span className="block text-xs font-semibold text-gray-600 mb-1">{tr.damageNote}</span>
        <textarea
          className="input-field"
          rows={2}
          maxLength={300}
          value={state.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder={tr.notesPlaceholder}
        />
      </label>
    </div>
  );
}

function DamagePhotoInput({ dataUrl, onCapture }) {
  const { tr } = useLang();
  const [loading, setLoading] = useState(false);
  const inputId = 'dmg-photo-' + Math.random().toString(36).slice(2, 9);

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
    <div>
      <span className="block text-xs font-semibold text-gray-600 mb-1">📷 {tr.damagePhoto}</span>
      <label htmlFor={inputId} className="block cursor-pointer">
        {dataUrl ? (
          <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 max-w-xs">
            <img src={dataUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-roshen-500 hover:text-roshen-600 transition py-4">
            <span className="text-xl">{loading ? '...' : '📸'}</span>
            <span className="text-[11px] ms-2 font-semibold">{tr.takePhoto}</span>
          </div>
        )}
      </label>
      <input id={inputId} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
    </div>
  );
}
