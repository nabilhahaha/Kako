'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import type { Job } from '@/lib/types';

function CoJobCard({ j }: { j: Job }) {
  const { s, update, toast } = useApp();
  const { t, tt } = useI18n();
  const ap = !!s.applied[j.id];
  const apply = () => {
    if (ap) return;
    update((p) => ({ applied: { ...p.applied, [j.id]: true } }));
    toast({ ar: 'أُرسل طلبك — بالتوفيق', en: 'Your application was sent — good luck' });
  };
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 15, padding: '13px 14px' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{t(j.t)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--grnTx)', background: 'var(--grnT)', borderRadius: 7, padding: '4px 9px' }}>{t(j.sal)}</span>
        <span style={{ fontSize: 10, color: 'var(--sub)' }}>{t(j.city)} · {t(j.when)}</span>
      </div>
      <span onClick={apply} style={{ cursor: 'pointer', display: 'flex', marginTop: 10, height: 40, borderRadius: 11, background: ap ? 'var(--grnT)' : 'var(--pri)', color: ap ? 'var(--grnTx)' : 'var(--onPri)', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'all .2s' }}>{ap ? tt('✓ تم التقديم', '✓ Applied') : tt('تقدّم بنقرة', 'Apply in one tap')}</span>
    </div>
  );
}

export function Company() {
  const { data, back, nav, toast } = useApp();
  const { tt } = useI18n();
  const coJobs = data.jobs.filter((j) => j.co.ar === 'شركة التوزيع الوطنية');
  const followCo = () => toast({ ar: 'أصبحت تتابع شركة التوزيع الوطنية', en: 'Now following National Distribution Co.' });

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ height: 92, background: 'repeating-linear-gradient(45deg,var(--dv) 0 10px,var(--chip) 10px 20px)', position: 'relative', flex: 'none' }}>
        <span onClick={back} style={{ cursor: 'pointer', position: 'absolute', top: 10, insetInlineEnd: 12, width: 34, height: 34, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tx)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
        </span>
        <span style={{ position: 'absolute', bottom: 8, insetInlineStart: 12, font: "500 8px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>company cover</span>
      </div>
      <div style={{ padding: '0 20px', marginTop: -26 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ width: 68, height: 68, flex: 'none', borderRadius: 18, background: 'var(--pri)', border: '3px solid var(--bg)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700 }}>تو</div>
          <div style={{ flex: 1, paddingBottom: 4 }}>
            <div style={{ fontSize: 16.5, fontWeight: 700 }}>{tt('شركة التوزيع الوطنية', 'National Distribution Co.')}</div>
            <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{tt('توزيع أغذية ومستهلكات · الرياض', 'Food & consumer goods distribution · Riyadh')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--sub)' }}><span style={{ fontWeight: 700, color: 'var(--tx)' }}>12</span> {tt('فرعًا', 'branches')}</span>
          <span style={{ fontSize: 11, color: 'var(--sub)' }}><span style={{ fontWeight: 700, color: 'var(--tx)' }}>340</span> {tt('موظفًا', 'employees')}</span>
          <span style={{ fontSize: 11, color: 'var(--sub)' }}><span style={{ fontWeight: 700, color: 'var(--tx)' }}>1.2k</span> {tt('متابع', 'followers')}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--grnTx)' }}>★ 4.6</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <span onClick={followCo} style={{ cursor: 'pointer', flex: 1, height: 42, borderRadius: 12, background: 'var(--pri)', color: 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, transition: 'transform .15s' }}>{tt('+ متابعة', '+ Follow')}</span>
          <span onClick={() => nav('messages')} style={{ cursor: 'pointer', flex: 1, height: 42, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', color: 'var(--tx)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, transition: 'transform .15s' }}>{tt('مراسلة', 'Message')}</span>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 15px', marginTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{tt('عن الشركة', 'About the company')}</div>
          <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.75, marginTop: 6 }}>{tt('موزع رائد للمواد الغذائية والاستهلاكية في المنطقة الوسطى منذ 2009 — شبكة تغطي التجزئة والجملة والتجارة الحديثة، تخدم أكثر من 3,400 نقطة بيع. شريك معتمد للعلامات العالمية، ويُوظف حاليًا.', 'A leading food & consumer-goods distributor in the central region since 2009 — a network spanning retail, wholesale & modern trade, serving over 3,400 points of sale. An accredited partner for global brands, and currently hiring.')}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--grnTx)', background: 'var(--grnT)', borderRadius: 99, padding: '4px 10px' }}>● {tt('يوظف الآن', 'Hiring now')}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--sub)', background: 'var(--chip)', borderRadius: 99, padding: '4px 10px' }}>{tt('تجزئة', 'Retail')}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--sub)', background: 'var(--chip)', borderRadius: 99, padding: '4px 10px' }}>{tt('جملة', 'Wholesale')}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--sub)', background: 'var(--chip)', borderRadius: 99, padding: '4px 10px' }}>{tt('تجارة حديثة', 'Modern trade')}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{tt('الوظائف المفتوحة', 'Open positions')}</span>
          <span style={{ fontSize: 10.5, color: 'var(--fnt)' }}>{tt(`${coJobs.length} وظيفة`, `${coJobs.length} job`)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 9, paddingBottom: 30 }}>
          {coJobs.map((j) => <CoJobCard key={j.id} j={j} />)}
        </div>
      </div>
    </div>
  );
}
