import { useEffect, useMemo, useState } from 'react';
import { useLang, useToast } from '../App.jsx';
import Header from '../components/Header.jsx';
import ActionSelector from '../components/ActionSelector.jsx';
import MySubmissionsTracker from '../components/MySubmissionsTracker.jsx';
import { ACTION_LABELS } from '../lib/actions.js';
import { getAgg, hasAgg, addSub, setPhotos } from '../lib/storage.js';
import { getSalesmen, getCustomersFor, getItemsFor } from '../lib/excel.js';
import { calcDays, daysColor, compressImage, genId } from '../lib/utils.js';

const STORE_NAME_KEY = 'nex_salesman_name';

const readStoredName = () => {
  try {
    return sessionStorage.getItem(STORE_NAME_KEY) || '';
  } catch {
    return '';
  }
};

const writeStoredName = (name) => {
  try {
    if (name) sessionStorage.setItem(STORE_NAME_KEY, name);
    else sessionStorage.removeItem(STORE_NAME_KEY);
  } catch {}
};

export default function SalesmanPage({ onLogout }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const [salesmanName, setSalesmanName] = useState(readStoredName());
  const [view, setView] = useState('home'); // 'home' | 'register' | 'tracker'

  const agg = useMemo(() => getAgg(), [view]);

  useEffect(() => {
    writeStoredName(salesmanName);
  }, [salesmanName]);

  if (!salesmanName) {
    return (
      <>
        <Header subtitle={tr.salesman} onLogout={onLogout} />
        <NameSelector
          agg={agg}
          onSelect={(name) => setSalesmanName(name)}
        />
      </>
    );
  }

  if (view === 'register') {
    if (!hasAgg()) {
      return (
        <>
          <Header subtitle={salesmanName} onLogout={onLogout} onBack={() => setView('home')} />
          <div className="p-5 text-center text-gray-500">{tr.noSalesmen}</div>
        </>
      );
    }
    return (
      <>
        <Header
          title={tr.registerItem}
          subtitle={salesmanName}
          onBack={() => setView('home')}
        />
        <RegisterFlow
          agg={agg}
          salesmanName={salesmanName}
          onDone={() => setView('home')}
          onViewTracker={() => setView('tracker')}
          onLogout={() => {
            writeStoredName('');
            onLogout();
          }}
        />
      </>
    );
  }

  if (view === 'tracker') {
    return (
      <>
        <Header
          title={tr.mySubmissions}
          subtitle={salesmanName}
          onBack={() => setView('home')}
        />
        <MySubmissionsTracker salesmanName={salesmanName} />
      </>
    );
  }

  return (
    <>
      <Header subtitle={salesmanName} onLogout={onLogout} />
      <SalesmanHome
        salesmanName={salesmanName}
        onRegister={() => setView('register')}
        onTracker={() => setView('tracker')}
        onChangeName={() => {
          writeStoredName('');
          setSalesmanName('');
        }}
      />
    </>
  );
}

/* ───────────────────── Salesman Home ───────────────────── */

function SalesmanHome({ salesmanName, onRegister, onTracker, onChangeName }) {
  const { tr } = useLang();
  return (
    <div className="p-4 space-y-3 fade-in">
      <div className="card p-5 bg-gradient-to-bl from-roshen-600 to-roshen-800 text-white">
        <p className="text-xs opacity-80">{tr.salesman}</p>
        <h2 className="text-xl font-bold mt-1">{salesmanName}</h2>
        <button onClick={onChangeName} className="text-xs mt-2 opacity-80 underline">
          {tr.selectYourName}
        </button>
      </div>

      <button
        onClick={onRegister}
        className="card w-full p-5 text-start active:scale-[0.99] transition hover:shadow-md flex items-center gap-3"
      >
        <span className="text-3xl">📝</span>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900">{tr.registerItem}</h3>
          <p className="text-xs text-gray-500">{tr.enterDetails}</p>
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
          <h3 className="font-bold text-gray-900">{tr.mySubmissions}</h3>
          <p className="text-xs text-gray-500">{tr.underReview} · {tr.approved} · {tr.closed}</p>
        </div>
        <span className="text-gray-400 rtl-only">←</span>
        <span className="text-gray-400 ltr-only">→</span>
      </button>
    </div>
  );
}

/* ───────────────────── Salesman Name Selector ───────────────────── */

function NameSelector({ agg, onSelect }) {
  const { tr } = useLang();
  const [q, setQ] = useState('');
  const names = useMemo(() => getSalesmen(agg), [agg]);
  const filtered = useMemo(
    () =>
      q ? names.filter((n) => n.toLowerCase().includes(q.toLowerCase())) : names,
    [names, q]
  );

  if (names.length === 0) {
    return (
      <div className="p-5 text-center fade-in">
        <div className="text-5xl mb-3">📂</div>
        <p className="text-gray-600 text-sm">{tr.noSalesmen}</p>
      </div>
    );
  }

  return (
    <div className="p-3 fade-in">
      <h2 className="font-bold text-gray-800 mb-2 px-1">{tr.selectYourName}</h2>
      <input
        type="text"
        className="input-field mb-3"
        placeholder={tr.searchByName}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="space-y-1.5">
        {filtered.map((name) => (
          <button
            key={name}
            onClick={() => onSelect(name)}
            className="card w-full p-3.5 text-start active:scale-[0.99] hover:bg-gray-50 transition flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-full bg-roshen-100 text-roshen-700 flex items-center justify-center font-bold shrink-0">
              {name.charAt(0)}
            </div>
            <span className="font-semibold text-sm flex-1">{name}</span>
            <span className="text-gray-300 rtl-only">←</span>
            <span className="text-gray-300 ltr-only">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────── Register Flow ───────────────────── */

function RegisterFlow({ agg, salesmanName, onDone, onViewTracker, onLogout }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const [step, setStep] = useState(1); // 1 customer → 2 item → 3 details → 4 success
  const [customer, setCustomer] = useState(null); // { acc, name }
  const [item, setItem] = useState(null); // { id, desc, qty }
  const [physQty, setPhysQty] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [expiryPhoto, setExpiryPhoto] = useState(null);
  const [qtyPhoto, setQtyPhoto] = useState(null);
  const [suggestion, setSuggestion] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);

  const daysRemaining = expiryDate ? calcDays(expiryDate) : null;

  const reset = () => {
    setStep(1);
    setCustomer(null);
    setItem(null);
    setPhysQty('');
    setExpiryDate('');
    setExpiryPhoto(null);
    setQtyPhoto(null);
    setSuggestion('');
    setNotes('');
    setSubmittedId(null);
  };

  /* Step 1: customer */
  if (step === 1) {
    return (
      <CustomerStep
        agg={agg}
        salesmanName={salesmanName}
        onPick={(c) => {
          setCustomer(c);
          setStep(2);
        }}
      />
    );
  }

  /* Step 2: item */
  if (step === 2) {
    return (
      <ItemStep
        agg={agg}
        salesmanName={salesmanName}
        customer={customer}
        onBack={() => setStep(1)}
        onPick={(it) => {
          setItem(it);
          setStep(3);
        }}
      />
    );
  }

  /* Step 4: success */
  if (step === 4) {
    return (
      <div className="p-6 text-center fade-in">
        <div className="text-6xl mb-3">✅</div>
        <h2 className="text-lg font-bold text-green-700">{tr.submissionSent}</h2>
        <p className="text-sm text-gray-500 mt-1">#{submittedId?.slice(-6)}</p>
        <div className="space-y-2 mt-6">
          <button onClick={reset} className="btn-primary w-full">
            {tr.registerAnother}
          </button>
          <button onClick={onViewTracker} className="btn-secondary w-full">
            📋 {tr.mySubmissions}
          </button>
          <button onClick={onDone} className="btn-ghost w-full text-sm">
            {tr.backToHome}
          </button>
        </div>
      </div>
    );
  }

  /* Step 3: details + photos + suggested action */

  const physQtyN = parseFloat(physQty);
  const isValid =
    item &&
    !isNaN(physQtyN) &&
    physQtyN > 0 &&
    expiryDate &&
    expiryPhoto &&
    qtyPhoto &&
    suggestion;

  const handleSubmit = async () => {
    if (!isValid) {
      toast(tr.fillAllFields, 'error');
      return;
    }
    setSubmitting(true);
    try {
      const id = genId();
      const sub = {
        id,
        salesmanName,
        custAccount: customer.acc,
        custName: customer.name,
        itemId: item.id,
        itemDesc: item.desc,
        netQty: item.qty,
        physQty: physQtyN,
        expiryDate,
        daysRemaining: calcDays(expiryDate),
        status: 'pending_tm',
        salesmanSuggestion: suggestion,
        salesmanNotes: notes.trim(),
        submittedAt: new Date().toISOString(),
        tmDecision: null,
        tmNotes: '',
        tmDecisionDate: null,
        roshenDecision: null,
        roshenNotes: '',
        roshenDecisionDate: null,
        editHistory: [],
      };
      setPhotos(id, expiryPhoto, qtyPhoto);
      addSub(sub);
      setSubmittedId(id);
      setStep(4);
    } catch (e) {
      console.error(e);
      toast(e.message || 'Error', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const dColor = daysRemaining !== null ? daysColor(daysRemaining) : null;
  const dayLabel =
    daysRemaining === null
      ? ''
      : daysRemaining < 0
      ? `${tr.daysExpired} ${Math.abs(daysRemaining)} ${tr.daysAr}`
      : `${daysRemaining} ${tr.daysAr}`;

  return (
    <div className="p-3 space-y-3 fade-in pb-8">
      <button onClick={() => setStep(2)} className="btn-ghost text-sm">
        ← {tr.back}
      </button>

      <div className="card p-3.5 bg-gray-50">
        <p className="text-[11px] text-gray-500">{tr.selectItem}</p>
        <p className="font-bold text-gray-900 leading-snug">{item.desc}</p>
        <p className="text-xs text-gray-500 mt-1" dir="ltr">{item.id}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-gray-600">{tr.systemQty}:</span>
          <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
            {item.qty} {tr.cases}
          </span>
        </div>
      </div>

      {/* Physical qty */}
      <label className="card p-3.5 block">
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

      {/* Expiry date */}
      <label className="card p-3.5 block">
        <span className="block text-xs font-semibold text-gray-600 mb-1">{tr.expiryDate}</span>
        <input
          type="date"
          className="input-field"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
        />
        {dColor && (
          <div className="mt-2">
            <span
              className="inline-block text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: dColor.bg, color: dColor.fg }}
            >
              📅 {tr.daysRemaining}: {dayLabel}
            </span>
          </div>
        )}
      </label>

      {/* Photos */}
      <div className="grid grid-cols-2 gap-3">
        <PhotoCapture
          label={tr.expiryPhoto}
          icon="📅"
          dataUrl={expiryPhoto}
          onCapture={setExpiryPhoto}
        />
        <PhotoCapture
          label={tr.qtyPhoto}
          icon="📦"
          dataUrl={qtyPhoto}
          onCapture={setQtyPhoto}
        />
      </div>

      {/* Suggestion */}
      <div className="card p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-gray-700">{tr.suggestedAction}</span>
          <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
            {tr.advisoryOnly}
          </span>
        </div>
        <ActionSelector value={suggestion} onChange={setSuggestion} />
      </div>

      {/* Notes */}
      <label className="card p-3.5 block">
        <span className="block text-xs font-semibold text-gray-600 mb-1">{tr.salesmanNotes}</span>
        <textarea
          className="input-field"
          rows={3}
          maxLength={300}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={tr.notesPlaceholder}
        />
        <span className="text-[10px] text-gray-400 block mt-1 text-end">
          {notes.length} / 300
        </span>
      </label>

      <button
        onClick={handleSubmit}
        disabled={!isValid || submitting}
        className="btn-primary w-full text-base"
      >
        {submitting ? '...' : `📤 ${tr.submit}`}
      </button>
    </div>
  );
}

/* ───────── Customer step ───────── */
function CustomerStep({ agg, salesmanName, onPick }) {
  const { tr } = useLang();
  const [q, setQ] = useState('');
  const customers = useMemo(() => getCustomersFor(agg, salesmanName), [agg, salesmanName]);
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return s
      ? customers.filter(
          (c) => c.name.toLowerCase().includes(s) || c.acc.toLowerCase().includes(s)
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
      <h2 className="font-bold text-gray-800 mb-2 px-1">{tr.selectCustomer}</h2>
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

/* ───────── Item step ───────── */
function ItemStep({ agg, salesmanName, customer, onBack, onPick }) {
  const { tr } = useLang();
  const [q, setQ] = useState('');
  const items = useMemo(
    () => getItemsFor(agg, salesmanName, customer.acc),
    [agg, salesmanName, customer]
  );
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return s
      ? items.filter(
          (it) => it.desc.toLowerCase().includes(s) || it.id.toLowerCase().includes(s)
        )
      : items;
  }, [items, q]);

  return (
    <div className="p-3 fade-in">
      <button onClick={onBack} className="btn-ghost text-sm mb-2">
        ← {tr.back}
      </button>
      <div className="card p-3 mb-3 bg-gray-50">
        <p className="text-[11px] text-gray-500">{tr.selectCustomer}</p>
        <p className="font-semibold text-sm">{customer.name}</p>
      </div>
      <h2 className="font-bold text-gray-800 mb-2 px-1">{tr.selectItem}</h2>
      <input
        type="text"
        className="input-field mb-3"
        placeholder={tr.searchItem}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {items.length === 0 ? (
        <p className="text-center text-gray-500 py-8 text-sm">{tr.noItems}</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((it) => (
            <button
              key={it.id}
              onClick={() => onPick(it)}
              className="card w-full p-3.5 text-start active:scale-[0.99] hover:bg-gray-50 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">
                📦
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm line-clamp-2">{it.desc}</p>
                <p className="text-[11px] text-gray-500 mt-0.5" dir="ltr">{it.id}</p>
              </div>
              <span className="shrink-0 bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
                {it.qty}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── Photo capture ───────── */
function PhotoCapture({ label, icon, dataUrl, onCapture }) {
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

  return (
    <div className="card p-2.5">
      <span className="text-[11px] font-semibold text-gray-600 block mb-1.5 truncate">
        {icon} {label}
      </span>
      <label htmlFor={inputId} className="block cursor-pointer">
        {dataUrl ? (
          <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
            <img src={dataUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition flex items-center justify-center opacity-0 hover:opacity-100">
              <span className="text-white text-xs bg-black/60 px-2 py-1 rounded">
                {tr.retake}
              </span>
            </div>
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
