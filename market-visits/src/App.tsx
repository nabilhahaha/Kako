import { useEffect, useMemo, useState } from 'react';
import { supabase, type MarketVisit } from './lib/supabase';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(n);

function startOf(period: 'day' | 'month'): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'month') d.setDate(1);
  return d;
}

export default function App() {
  const [visits, setVisits] = useState<MarketVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // form state
  const [shopName, setShopName] = useState('');
  const [area, setArea] = useState('');
  const [hadOrder, setHadOrder] = useState(false);
  const [orderValue, setOrderValue] = useState('');
  const [notes, setNotes] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('mv_visits')
      .select('*')
      .order('visited_at', { ascending: false })
      .limit(200);
    if (error) setError(error.message);
    else setVisits((data ?? []) as MarketVisit[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addVisit(e: React.FormEvent) {
    e.preventDefault();
    if (!shopName.trim()) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from('mv_visits').insert({
      shop_name: shopName.trim(),
      area: area.trim() || null,
      had_order: hadOrder,
      order_value: hadOrder ? Number(orderValue) || 0 : 0,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setShopName('');
    setArea('');
    setHadOrder(false);
    setOrderValue('');
    setNotes('');
    load();
  }

  async function remove(id: string) {
    const prev = visits;
    setVisits((v) => v.filter((x) => x.id !== id));
    const { error } = await supabase.from('mv_visits').delete().eq('id', id);
    if (error) {
      setError(error.message);
      setVisits(prev);
    }
  }

  const kpis = useMemo(() => {
    const total = visits.length;
    const withOrder = visits.filter((v) => v.had_order);
    const strikeRate = total ? (withOrder.length / total) * 100 : 0;
    const orderSum = withOrder.reduce((s, v) => s + Number(v.order_value), 0);
    const dropSize = withOrder.length ? orderSum / withOrder.length : 0;
    const dayStart = startOf('day').getTime();
    const monthStart = startOf('month').getTime();
    const today = visits.filter((v) => new Date(v.visited_at).getTime() >= dayStart).length;
    const month = visits.filter((v) => new Date(v.visited_at).getTime() >= monthStart).length;
    return { total, strikeRate, dropSize, orderSum, today, month };
  }, [visits]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">متتبع زيارات السوق</h1>
        <p className="text-sm text-slate-500">سجّل زياراتك وتابع أداءك أول بأول</p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="إجمالي الزيارات" value={fmt(kpis.total)} tone="slate" />
        <Kpi label="معدل التحول" value={`${fmt(kpis.strikeRate)}%`} tone="emerald" />
        <Kpi label="متوسط الطلب" value={fmt(kpis.dropSize)} tone="amber" />
        <Kpi label="زيارات اليوم" value={fmt(kpis.today)} tone="sky" />
      </section>

      <form
        onSubmit={addVisit}
        className="mb-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="font-semibold">تسجيل زيارة جديدة</h2>
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          placeholder="اسم المحل / العميل *"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          required
        />
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          placeholder="المنطقة / السوق"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={hadOrder}
            onChange={(e) => setHadOrder(e.target.checked)}
          />
          نتج عن الزيارة طلب
        </label>
        {hadOrder && (
          <input
            type="number"
            min="0"
            step="0.01"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            placeholder="قيمة الطلب"
            value={orderValue}
            onChange={(e) => setOrderValue(e.target.value)}
          />
        )}
        <textarea
          className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          placeholder="ملاحظات (اختياري)"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-slate-900 py-2.5 font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'جارٍ الحفظ…' : 'حفظ الزيارة'}
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">آخر الزيارات</h2>
          <span className="text-xs text-slate-500">هذا الشهر: {fmt(kpis.month)}</span>
        </div>
        {loading ? (
          <p className="py-8 text-center text-slate-400">جارٍ التحميل…</p>
        ) : visits.length === 0 ? (
          <p className="py-8 text-center text-slate-400">لا توجد زيارات بعد — سجّل أول زيارة فوق.</p>
        ) : (
          <ul className="space-y-2">
            {visits.map((v) => (
              <li
                key={v.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{v.shop_name}</span>
                    {v.had_order ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        طلب {fmt(Number(v.order_value))}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        بدون طلب
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {v.area ? `${v.area} · ` : ''}
                    {new Date(v.visited_at).toLocaleString('ar-EG', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </div>
                  {v.notes && <p className="mt-1 text-sm text-slate-600">{v.notes}</p>}
                </div>
                <button
                  onClick={() => remove(v.id)}
                  className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                >
                  حذف
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'emerald' | 'amber' | 'sky';
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    sky: 'bg-sky-100 text-sky-700',
  };
  return (
    <div className={`rounded-2xl px-3 py-3 ${tones[tone]}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
