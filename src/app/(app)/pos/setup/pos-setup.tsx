'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Search, Loader2, Camera, Image as ImageIcon, Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { getPosSetupProducts, uploadProductImage, type PosProduct } from '../pos-actions';

/**
 * Fast Food POS — setup: product image management. Reuses the shared attachments storage
 * bucket (no new media engine); the POS loader signs the stored path on read. Admin gate.
 */
export function PosSetup() {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPosSetupProducts();
    setProducts(res.ok ? res.data : []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function onFile(productId: string, file: File) {
    setBusy(productId); setDone(null);
    const fd = new FormData(); fd.append('file', file);
    const res = await uploadProductImage(productId, fd);
    setBusy(null);
    if (res.ok) { setDone(productId); await load(); window.setTimeout(() => setDone(null), 1500); }
  }

  const filtered = products.filter((p) => {
    const q = query.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q) || (p.barcode ?? '').includes(q);
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/pos" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></Link>
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold"><ImageIcon className="h-5 w-5 text-primary" /> {t('foodPosSetup.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('foodPosSetup.subtitle')}</p>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{t('foodPosSetup.imageHint')}</p>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('foodPosSetup.search')}
          className="h-10 w-full rounded-xl border bg-background ps-9 pe-3 text-sm" />
      </div>

      {loading ? <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        : filtered.length === 0 ? <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">{t('foodPosSetup.empty')}</div>
        : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filtered.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border bg-card p-2.5">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
                  {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-muted-foreground"><ImageIcon className="h-5 w-5 opacity-40" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{(ar && p.nameAr) || p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[p.code, p.barcode].filter(Boolean).join(' · ') || '—'} · {p.price.toFixed(2)}</p>
                </div>
                <input ref={(el) => { fileRefs.current[p.id] = el; }} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(p.id, f); e.target.value = ''; }} />
                <button onClick={() => fileRefs.current[p.id]?.click()} disabled={busy === p.id}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium hover:bg-secondary disabled:opacity-50">
                  {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : done === p.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Camera className="h-4 w-4" />}
                  {t('foodPosSetup.uploadImage')}
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
