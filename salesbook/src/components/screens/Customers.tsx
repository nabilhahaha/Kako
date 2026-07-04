'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Icon, ScoreRing } from '@/components/ui';
import { decoCustomer } from '@/lib/deco';
import type { Customer } from '@/lib/types';

const shimmer = { background: 'linear-gradient(90deg,var(--dv) 25%,var(--chip) 50%,var(--dv) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' };

function Bell() {
  const { s, set } = useApp();
  const unread = s.notifRead ? 0 : 4;
  return (
    <div onClick={() => set({ screen: 'notif', stack: ['home'] })} style={{ cursor: 'pointer', position: 'relative', width: 40, height: 40, flex: 'none', borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="bell" size={17} stroke="var(--tx)" />
      {unread > 0 && <span style={{ position: 'absolute', top: 6, insetInlineStart: 7, minWidth: 15, height: 15, background: 'var(--org)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg)', padding: '0 2px' }}>{unread}</span>}
    </div>
  );
}

export function CustomerCard({ c, i }: { c: Customer; i: number }) {
  const { openC, toast } = useApp();
  const { t, tt } = useI18n();
  const d = decoCustomer(c, useI18n().lang, i);
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 18, padding: '15px 16px', boxShadow: '0 1px 2px var(--sh)', animation: 'fadeUp .32s cubic-bezier(.22,1,.36,1) both', animationDelay: d.dl }}>
      <div onClick={() => openC(c.id)} style={{ cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 54, height: 54, flex: 'none', borderRadius: 14, background: 'repeating-linear-gradient(45deg,var(--dv) 0 8px,var(--chip) 8px 16px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ font: "500 8px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>store</span></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t(c.name)}</div>
          <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 2 }}>{t(c.area)} · {t(c.dist)}</div>
        </div>
        <ScoreRing score={c.score} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        {d.chips.map((h, k) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: h.c, background: h.bg, borderRadius: 8, padding: '5px 9px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: h.d }} />{h.t}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 12, background: 'var(--bg)', borderRadius: 12, padding: '10px 12px' }}>
        <div style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: c.av, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{c.ini}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: 'var(--tx)', lineHeight: 1.55 }}>{t(c.updTxt)}</div>
          <div style={{ fontSize: 10.5, color: 'var(--fnt)', marginTop: 2 }}>{t(c.updBy)} · {t(c.updWhen)} · {tt(`موثق من ${c.verif} مناديب`, `verified by ${c.verif} reps`)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <span onClick={() => toast({ ar: `جارٍ الاتصال بـ${c.contacts[0].n.ar}…`, en: `Calling ${c.contacts[0].n.en}…` })} style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: 11, background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="phone" size={15} stroke="var(--sub)" sw={1.9} /></span>
        <span onClick={() => toast({ ar: `فتح محادثة واتساب مع ${c.contacts[0].n.ar}`, en: `Opening WhatsApp with ${c.contacts[0].n.en}` })} style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: 11, background: 'var(--grnT)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="chat" size={15} stroke="var(--grn)" sw={1.9} /></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--sub)' }}><Icon name="chat" size={13} stroke="var(--sub)" />{c.comments}</span>
        <span onClick={() => openC(c.id)} style={{ cursor: 'pointer', marginInlineStart: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--pri)', background: 'var(--priT)', borderRadius: 10, padding: '8px 16px' }}>{tt('فتح الملف', 'Open profile')}</span>
      </div>
    </div>
  );
}

export function Customers() {
  const { s, data, set } = useApp();
  const { tt } = useI18n();

  let feed = data.customers.filter((x) =>
    s.filter === 'all' ? true : s.filter === 'ri' ? x.city === 'الرياض' : s.filter === 'je' ? x.city === 'جدة' : s.filter === 'late' ? x.late : x.stale);
  feed = feed.slice().sort((a, b) => (s.sort === 'near' ? a.distN - b.distN : 0));

  const filters = [
    { k: 'all', t: tt('الكل', 'All') }, { k: 'ri', t: tt('الرياض', 'Riyadh') }, { k: 'je', t: tt('جدة', 'Jeddah') },
    { k: 'late', t: tt('دفع متأخر', 'Late payment') }, { k: 'stale', t: tt('يحتاج تحديث', 'Needs update') },
  ];
  const sortBtn = (key: 'new' | 'near', label: string) => {
    const on = s.sort === key;
    return <span onClick={() => set({ sort: key })} style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 700, padding: '4.5px 11px', borderRadius: 7, background: on ? 'var(--card)' : 'transparent', color: on ? 'var(--tx)' : 'var(--fnt)', boxShadow: on ? '0 1px 3px var(--sh)' : 'none', transition: 'all .2s' }}>{label}</span>;
  };

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px 0' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{tt('العملاء', 'Customers')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 1 }}>{tt('128 عميلًا في نطاقك · 5 يحتاجون انتباهًا', '128 customers in your area · 5 need attention')}</div>
        </div>
        <Bell />
      </div>
      <div onClick={() => set({ screen: 'search', stack: ['home'], query: '' })} style={{ cursor: 'pointer', margin: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 13, padding: '12px 14px' }}>
        <Icon name="search" size={16} stroke="var(--fnt)" />
        <span style={{ fontSize: 13, color: 'var(--fnt)' }}>{tt('ابحث عن عميل، جهة اتصال، رقم…', 'Search for a customer, contact, number…')}</span>
      </div>
      <div data-scroll="true" style={{ display: 'flex', gap: 8, padding: '12px 20px 2px', overflowX: 'auto' }}>
        {filters.map((f) => {
          const on = s.filter === f.k;
          return <span key={f.k} onClick={() => set({ filter: f.k })} style={{ cursor: 'pointer', flex: 'none', fontSize: 12, fontWeight: on ? 700 : 500, padding: '7px 14px', borderRadius: 99, background: on ? 'var(--pri)' : 'var(--card)', color: on ? 'var(--onPri)' : 'var(--sub)', border: `1px solid ${on ? 'var(--pri)' : 'var(--bd)'}`, transition: 'all .18s', userSelect: 'none' }}>{f.t}</span>;
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 0' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{tt('آخر التحديثات', 'Latest updates')}</span>
        <div style={{ display: 'flex', background: 'var(--chip)', borderRadius: 9, padding: 2.5 }}>
          {sortBtn('new', tt('الأحدث', 'Newest'))}
          {sortBtn('near', tt('الأقرب', 'Nearest'))}
        </div>
      </div>

      {s.loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 20px 90px' }}>
          {[0, 1].map((k) => (
            <div key={k} style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 18, padding: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ width: 54, height: 54, borderRadius: 14, ...shimmer }} />
                <span style={{ flex: 1, height: 14, borderRadius: 7, ...shimmer }} />
                <span style={{ width: 48, height: 48, borderRadius: '50%', ...shimmer }} />
              </div>
              <span style={{ display: 'block', height: 11, borderRadius: 6, marginTop: 14, width: '70%', ...shimmer }} />
              <span style={{ display: 'block', height: 11, borderRadius: 6, marginTop: 8, width: '45%', ...shimmer }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 20px 96px' }}>
          {feed.map((c, i) => <CustomerCard key={c.id} c={c} i={i} />)}
        </div>
      )}
    </div>
  );
}
