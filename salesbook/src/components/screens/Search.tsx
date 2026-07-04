'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { scoreCol } from '@/lib/tokens';

export function Search() {
  const { s, data, set, back, openC, startReport } = useApp();
  const { t, tt } = useI18n();

  const q = s.query.trim();
  const qq = q.replace(/\s/g, '');
  const matchContact = (k: { n: { ar: string; en: string }; phone: string }) =>
    t(k.n).includes(q) || k.phone.replace(/\s/g, '').includes(qq);

  const results = q
    ? data.customers.filter((x) =>
        t(x.name).includes(q) || t(x.area).includes(q) || x.city.includes(q) ||
        x.contacts.some(matchContact))
    : [];

  const contactHits = q
    ? data.customers.flatMap((x) =>
        x.contacts.filter(matchContact).map((k) => ({
          n: t(k.n), ini: k.ini, role: `${t(k.role)} — ${t(x.name)}`, phone: k.phone, id: x.id,
        })))
    : [];

  const hasQuery = !!q;
  const showStart = !q;
  const hasCustHits = results.length > 0;
  const hasContactHits = contactHits.length > 0;
  const showEmpty = !!q && results.length === 0 && contactHits.length === 0;

  const recents = [
    { ar: 'النخيل', en: 'Nakheel' },
    { ar: 'فهد القحطاني', en: 'Fahd Al-Qahtani' },
    { ar: '0555', en: '0555' },
    { ar: 'الدمام', en: 'Dammam' },
  ].map((r) => tt(r.ar, r.en));

  const searchIn = [
    { bg: 'var(--priT)', c: 'var(--lnk)', label: tt('العملاء والمتاجر', 'Customers & stores'), icon: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></> },
    { bg: 'var(--grnT)', c: 'var(--grn)', label: tt('جهات الاتصال', 'Contacts'), icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></> },
    { bg: 'var(--ambT)', c: 'var(--amb)', label: tt('أرقام الهواتف', 'Phone numbers'), icon: <path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /> },
    { bg: 'var(--orgT)', c: 'var(--org)', label: tt('المدن والأحياء', 'Cities & districts'), icon: <><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></> },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 20px 0' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, background: 'var(--card)', border: '1.5px solid var(--pri)', borderRadius: 14, padding: '0 14px', height: 48, boxShadow: '0 4px 14px var(--sh)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fnt)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={s.query} onChange={(e) => set({ query: e.target.value })} placeholder={tt('عملاء، جهات اتصال، أرقام، مدن…', 'Customers, contacts, numbers, cities…')} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: 'var(--tx)' }} />
          {hasQuery && <span onClick={() => set({ query: '' })} style={{ cursor: 'pointer', width: 20, height: 20, borderRadius: '50%', background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--sub)' }}>×</span>}
        </div>
        <span onClick={back} style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--lnk)' }}>{tt('إلغاء', 'Cancel')}</span>
      </div>

      <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px 90px' }}>
        {showStart && (
          <div style={{ animation: 'fadeUp .25s both' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fnt)', letterSpacing: '.3px' }}>{tt('عمليات بحث أخيرة', 'Recent searches')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
              {recents.map((r, i) => (
                <span key={i} onClick={() => set({ query: r })} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--sub)', background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 99, padding: '7px 13px', transition: 'transform .15s' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fnt)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>{r}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fnt)', letterSpacing: '.3px', marginTop: 22 }}>{tt('يمكنك البحث في', 'You can search in')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              {searchIn.map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 13, padding: '11px 13px' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: it.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={it.c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 600 }}>{it.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasCustHits && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fnt)', letterSpacing: '.3px', animation: 'fadeUp .2s both' }}>{tt('العملاء', 'Customers')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 9, marginBottom: 16 }}>
              {results.map((c, i) => (
                <div key={c.id} onClick={() => openC(c.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 15, padding: '12px 14px', transition: 'transform .15s', animation: 'fadeUp .25s both', animationDelay: `${i * 50}ms` }}>
                  <div style={{ width: 42, height: 42, flex: 'none', borderRadius: 12, background: 'repeating-linear-gradient(45deg,var(--dv) 0 8px,var(--chip) 8px 16px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ font: "500 7px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>store</span></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t(c.name)}</div>
                    <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{t(c.area)} · {tt(`موثق من ${c.verif} مناديب`, `verified by ${c.verif} reps`)}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: scoreCol(c.score) }}>{c.score}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {hasContactHits && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fnt)', letterSpacing: '.3px', animation: 'fadeUp .2s both' }}>{tt('جهات الاتصال', 'Contacts')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 9 }}>
              {contactHits.map((k, i) => (
                <div key={i} onClick={() => openC(k.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 15, padding: '11px 14px', transition: 'transform .15s' }}>
                  <div style={{ width: 38, height: 38, flex: 'none', borderRadius: '50%', background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--lnk)' }}>{k.ini}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{k.n}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 2 }}>{k.role}</div>
                  </div>
                  <span style={{ font: "500 10px 'IBM Plex Mono',monospace", color: 'var(--fnt)', direction: 'ltr' }}>{k.phone}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {showEmpty && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 60, animation: 'fadeUp .25s both' }}>
            <div style={{ width: 74, height: 74, borderRadius: '50%', background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--fnt)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 16 }}>{tt(`لا توجد نتائج لـ«${q}»`, `No results for “${q}”`)}</div>
            <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 6, lineHeight: 1.7 }}>{tt('جرّب اسمًا أقصر أو رقم هاتف —', 'Try a shorter name or a phone number —')}<br />{tt('أو أنشئ عميلًا جديدًا إن لم يكن مسجلًا', 'or create a new customer if not registered')}</div>
            <span onClick={() => startReport(null)} style={{ cursor: 'pointer', marginTop: 16, fontSize: 12, fontWeight: 700, color: 'var(--pri)', background: 'var(--priT)', borderRadius: 11, padding: '10px 18px', transition: 'transform .15s' }}>{tt('+ عميل جديد', '+ New customer')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
