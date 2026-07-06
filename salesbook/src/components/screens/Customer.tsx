'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { tone, scoreCol, scoreRing } from '@/lib/tokens';
import type { ApprovalStatus } from '@/lib/types';

type ToneKey = 'g' | 'b' | 'a' | 'o' | 'r' | 'n';

export function Customer() {
  const { s, data, set, startReport, nav, back, toast } = useApp();
  const { t, tt } = useI18n();

  const sel = data.customers.find((c) => c.id === s.selId) ?? data.customers[0];
  const startReportHere = () => startReport(sel.id);

  // ---- derived score / health helpers (ported from renderVals) ----
  const col = scoreCol(sel.score);
  const lbl = sel.score >= 85 ? tt('ممتاز', 'Excellent') : sel.score >= 70 ? tt('جيد', 'Good') : sel.score >= 50 ? tt('متوسط', 'Average') : tt('خطر مرتفع', 'High risk');

  const pt = sel.pay.tone;
  const payRawC = tone(pt).d;
  const payFill = ({ g: 5, a: 3, r: 1 } as Record<string, number>)[pt] || 3;
  const payGrade = ({ g: 'A', a: 'C', r: 'D' } as Record<string, string>)[pt] || 'B';
  const payGradeC = payRawC;
  const paySegs = Array.from({ length: 5 }, (_, i) => (i < payFill ? payRawC : 'var(--dv)'));
  const payRiskTone = tone(sel.pay.riskTone);
  const payG = sel.pay.light === 'g' ? 1 : 0.18;
  const payY = sel.pay.light === 'y' ? 1 : 0.18;
  const payR = sel.pay.light === 'r' ? 1 : 0.18;

  const mvMap = ({
    'سريعة': { v: 90, pos: '84%' }, 'متوسطة': { v: 60, pos: '52%' }, 'بطيئة': { v: 30, pos: '20%' },
  } as Record<string, { v: number; pos: string }>)[sel.move.speed.ar] || { v: 60, pos: '52%' };
  const mvPos = mvMap.pos;
  const payRel = ({ g: 95, a: 55, r: 20 } as Record<string, number>)[pt] || 50;
  const ordMap: Record<string, number> = { 'كل 12 يوم': 88, 'كل 15 يوم': 82, 'كل 24 يوم': 60, 'كل 38 يوم': 35, 'كل 41 يوم': 30 };

  const health = [
    { t: tt('موثوقية الدفع', 'Payment reliability'), v: payRel },
    { t: tt('حركة المنتجات', 'Product movement'), v: mvMap.v },
    { t: tt('قوة العلاقة', 'Relationship strength'), v: Math.min(90, sel.verif * 11) },
    { t: tt('اكتمال البيانات', 'Data completeness'), v: 40 + sel.contacts.length * 15 },
    { t: tt('حداثة البيانات', 'Data freshness'), v: sel.stale ? 25 : sel.id === 'n1' ? 92 : 80 },
    { t: tt('انتظام الطلبات', 'Order regularity'), v: ordMap[sel.move.days.ar] || 50 },
  ].map((f) => ({ t: f.t, v: f.v, w: `${f.v}%`, c: f.v >= 75 ? 'var(--grn)' : f.v >= 50 ? 'var(--amb)' : 'var(--red)' }));

  const trend = sel.move.trend.map((h, i) => ({ h: `${h}%`, bg: i >= 4 ? (i === 5 ? 'var(--grn)' : 'var(--pri)') : 'var(--dv)' }));

  const galleryTiles = [
    tt('واجهة المتجر', 'Store front'), tt('الأرفف', 'Shelves'), tt('الثلاجات', 'Coolers'),
    tt('عرض ترويجي', 'Promo display'), tt('قبل التنفيذ', 'Before'), tt('بعد التنفيذ', 'After'),
  ];

  // health chip on the header
  const hc = sel.score >= 70 ? { t: tt('سليم', 'Healthy'), k: 'g' as ToneKey } : sel.score >= 50 ? { t: tt('يحتاج متابعة', 'Needs follow-up'), k: 'a' as ToneKey } : { t: tt('خطر مرتفع', 'High risk'), k: 'r' as ToneKey };
  const healthChip = { ...tone(hc.k), t: hc.t };

  // AI smart summary — bilingual sentence
  const delay = t(sel.pay.delay);
  const days = t(sel.move.days);
  const avg = t(sel.avg);
  const best = t(sel.best);
  const decision = t(sel.kyc.decision);
  const payPart = pt === 'g' ? tt(`في موعده غالبًا (${delay})`, `usually on time (${delay})`) : tt(`بتأخير ${delay}`, `with a delay of ${delay}`);
  const ai = tt(
    `عميل ${lbl} — يسدد ${payPart}، ويعيد الطلب ${days} بمتوسط ${avg}. أفضل تواصل ${best}، والقرار النهائي بيد ${decision}.`,
    `A ${lbl} customer — pays ${payPart}, reorders ${days} averaging ${avg}. Best contact ${best}, and the final decision rests with ${decision}.`,
  );

  const stPill = (st: ApprovalStatus): { t: string; k: ToneKey } =>
    st === 'approved' ? { t: tt('معتمد', 'Approved'), k: 'g' } : st === 'rejected' ? { t: tt('مرفوض', 'Rejected'), k: 'r' } : { t: tt('قيد المراجعة', 'Pending'), k: 'a' };

  const tabs: { k: string; t: string }[] = [
    { k: 'ov', t: tt('نظرة عامة', 'Overview') }, { k: 'ct', t: tt('جهات الاتصال', 'Contacts') },
    { k: 'pay', t: tt('الدفع', 'Payment') }, { k: 'mv', t: tt('الحركة', 'Movement') },
    { k: 'nt', t: tt('الملاحظات', 'Notes') }, { k: 'gl', t: tt('المعرض', 'Gallery') },
    { k: 'ps', t: tt('منشورات', 'Posts') },
  ];

  const custPosts = data.posts.filter((p) => p.cid === sel.id && p.type !== 'post');

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px 0' }}>
        <span onClick={back} style={{ cursor: 'pointer', width: 36, height: 36, flex: 'none', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx)" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg></span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sub)' }}>{tt('ملف العميل', 'Customer profile')}</span>
        <span onClick={() => nav('history')} style={{ cursor: 'pointer', marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--lnk)', background: 'var(--priT)', borderRadius: 10, padding: '8px 12px', transition: 'transform .15s' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>{tt('سجل التغييرات', 'Change history')}</span>
      </div>

      {/* identity row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 20px 0' }}>
        <div style={{ width: 58, height: 58, flex: 'none', borderRadius: 18, background: 'repeating-linear-gradient(45deg,var(--dv) 0 9px,var(--chip) 9px 18px)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ font: "500 8px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>store</span></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 17.5, fontWeight: 700 }}>{t(sel.name)}</span></div>
          <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 2 }}>{t(sel.area)} · {t(sel.dist)} · {tt('عميل منذ 2019', 'customer since 2019')}</div>
          <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: healthChip.c, background: healthChip.bg, borderRadius: 7, padding: '3.5px 8px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: healthChip.d }} />{tt('صحة العميل: ', 'Customer health: ')}{healthChip.t}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--grnTx)', background: 'var(--grnT)', borderRadius: 7, padding: '3.5px 8px' }}>{tt(`موثق من ${sel.verif} مناديب`, `verified by ${sel.verif} reps`)}</span>
          </div>
        </div>
        <div style={{ flex: 'none', width: 52, height: 52, borderRadius: '50%', background: scoreRing(sel.score), display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'ringPop .45s cubic-bezier(.22,1,.36,1) both' }}>
          <div style={{ width: 41, height: 41, borderRadius: '50%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}><span style={{ fontSize: 14.5, fontWeight: 700, color: col }}>{sel.score}</span><span style={{ fontSize: 6.5, color: 'var(--fnt)', marginTop: 1 }}>{tt('ذكاء العميل', 'Customer IQ')}</span></div>
        </div>
      </div>

      {/* KYC 30s card */}
      <div style={{ margin: '14px 20px 0', background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 2px var(--sh)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid var(--dv)' }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--priT)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg></span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{tt('اعرف عميلك في 30 ثانية', 'Know your customer in 30 seconds')}</span>
          <span style={{ marginInlineStart: 'auto', fontSize: 10, color: 'var(--fnt)' }}>{tt('محدث ', 'Updated ')}{t(sel.kyc.updated)}</span>
        </div>
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 16px', background: 'var(--priT)' }}>
          <svg style={{ flex: 'none', marginTop: 2 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth="1.8"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5" /><circle cx="12" cy="12" r="3.5" /></svg>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--tx)' }}>{ai}</div><div style={{ fontSize: 9.5, color: 'var(--fnt)', marginTop: 3 }}>{tt('ملخص ذكي — مستخلص من التقارير الموثقة', 'Smart summary — derived from verified reports')}</div></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--dv)' }}>
          <div style={{ background: 'var(--card)', padding: '11px 16px' }}><div style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt('صاحب القرار', 'Decision maker')}</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{t(sel.kyc.decision)}</div><div style={{ fontSize: 10, color: 'var(--grnTx)', marginTop: 1 }}>{tt(`موثق ×${sel.kyc.decisionV}`, `verified ×${sel.kyc.decisionV}`)}</div></div>
          <div style={{ background: 'var(--card)', padding: '11px 16px' }}><div style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt('مسؤول المشتريات', 'Purchasing manager')}</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{t(sel.kyc.buyer)}</div><div style={{ fontSize: 10, color: 'var(--grnTx)', marginTop: 1 }}>{tt(`موثق ×${sel.kyc.buyerV}`, `verified ×${sel.kyc.buyerV}`)}</div></div>
          <div style={{ background: 'var(--card)', padding: '11px 16px' }}><div style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt('تقييم الدفع', 'Payment rating')}</div><div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}><span style={{ fontSize: 15, fontWeight: 700, color: payGradeC }}>{payGrade}</span><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{t(sel.pay.short)} · {t(sel.pay.delay)}</span></div></div>
          <div style={{ background: 'var(--card)', padding: '11px 16px' }}><div style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt('حركة المنتجات', 'Product movement')}</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{t(sel.move.speed)} · {t(sel.move.days)}</div></div>
          <div style={{ background: 'var(--card)', padding: '11px 16px' }}><div style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt('متوسط الطلبية', 'Average order')}</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{t(sel.avg)}</div></div>
          <div style={{ background: 'var(--card)', padding: '11px 16px' }}><div style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt('أفضل وقت للزيارة', 'Best time to visit')}</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{t(sel.best)}</div></div>
        </div>
        <div style={{ padding: '11px 16px', borderTop: '1px solid var(--dv)', display: 'flex', gap: 8, alignItems: 'flex-start' }}><span style={{ flex: 'none', width: 7, height: 7, borderRadius: '50%', background: 'var(--pri)', marginTop: 6 }} /><div style={{ fontSize: 12, color: 'var(--tx)', lineHeight: 1.65 }}>{t(sel.kyc.note)}</div></div>
        {!!t(sel.warn) && (
          <div style={{ margin: '0 12px 12px', padding: '10px 12px', background: 'var(--orgT)', borderRadius: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}><svg style={{ flex: 'none', marginTop: 2 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--org)" strokeWidth="2"><path d="M12 3 2 21h20z" /><path d="M12 10v4M12 17.5v.5" /></svg><div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.6, color: 'var(--orgTx)' }}>{tt('تحذير: ', 'Warning: ')}{t(sel.warn)}</div></div>
        )}
      </div>

      {/* action buttons */}
      <div style={{ display: 'flex', gap: 8, margin: '12px 20px 0' }}>
        <span onClick={() => toast({ ar: `جارٍ الاتصال بـ${sel.contacts[0].n.ar}…`, en: `Calling ${sel.contacts[0].n.en}…` })} style={{ cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'var(--pri)', color: 'var(--onPri)', borderRadius: 14, padding: '11px 0', fontSize: 11, fontWeight: 700, transition: 'transform .15s', boxShadow: '0 6px 16px var(--sh)' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9"><path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>{tt('اتصال', 'Call')}</span>
        <span onClick={() => toast({ ar: `فتح محادثة واتساب مع ${sel.contacts[0].n.ar}`, en: `Opening WhatsApp with ${sel.contacts[0].n.en}` })} style={{ cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '11px 0', fontSize: 11, fontWeight: 700, color: 'var(--tx)', transition: 'transform .15s' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--grn)" strokeWidth="1.9"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" /></svg>{tt('واتساب', 'WhatsApp')}</span>
        <span style={{ cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '11px 0', fontSize: 11, fontWeight: 700, color: 'var(--tx)', transition: 'transform .15s' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth="1.9"><path d="m3 11 18-8-8 18-2-8z" /></svg>{tt('الاتجاهات', 'Directions')}</span>
        <span onClick={startReportHere} style={{ cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '11px 0', fontSize: 11, fontWeight: 700, color: 'var(--tx)', transition: 'transform .15s' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--org)" strokeWidth="1.9"><path d="M12 5v14M5 12h14" /></svg>{tt('تقرير', 'Report')}</span>
      </div>

      {/* tab bar */}
      <div data-scroll="true" style={{ display: 'flex', gap: 2, padding: '14px 20px 0', overflowX: 'auto', borderBottom: '1px solid var(--dv)' }}>
        {tabs.map((tb) => {
          const on = s.tab === tb.k;
          return <span key={tb.k} onClick={() => set({ tab: tb.k })} style={{ cursor: 'pointer', flex: 'none', fontSize: 12, fontWeight: on ? 700 : 500, color: on ? 'var(--pri)' : 'var(--sub)', borderBottom: on ? '2.5px solid var(--pri)' : '2.5px solid transparent', padding: '8px 10px', transition: 'all .2s', userSelect: 'none' }}>{tb.t}</span>;
        })}
      </div>

      {/* OVERVIEW */}
      {s.tab === 'ov' && (
        <div style={{ padding: '14px 20px 90px', animation: 'fadeUp .25s both' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 13, fontWeight: 700 }}>{tt('مكوّنات مؤشر الذكاء', 'Intelligence score components')}</span><span style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt('6 عوامل محسوبة تلقائيًا', '6 auto-computed factors')}</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
              {health.map((h, k) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 'none', width: 96, fontSize: 11, color: 'var(--sub)' }}>{h.t}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--dv)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: h.w, borderRadius: 3, background: h.c, transition: 'width .6s cubic-bezier(.22,1,.36,1)' }} /></div>
                  <span style={{ flex: 'none', width: 24, fontSize: 11, fontWeight: 700, color: 'var(--tx)', textAlign: 'end' }}>{h.v}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{tt('آخر تحديث', 'Latest update')}</span><span onClick={() => set({ tab: 'nt' })} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--lnk)' }}>{tt('كل الملاحظات', 'All notes')}</span></div>
          {(() => {
            const n = sel.notes[0];
            const st = n.st === 'approved' ? { t: tt('معتمد', 'Approved'), k: 'g' as ToneKey } : { t: tt('قيد المراجعة', 'Pending'), k: 'a' as ToneKey };
            const tn = tone(st.k);
            return (
              <div style={{ marginTop: 9, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 15px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: n.av, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{n.ini}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ fontSize: 12, fontWeight: 700 }}>{t(n.by)}</span><span style={{ fontSize: 10, color: 'var(--fnt)' }}>{t(n.when)}</span><span style={{ marginInlineStart: 'auto', fontSize: 9, fontWeight: 700, color: tn.c, background: tn.bg, borderRadius: 6, padding: '2.5px 7px' }}>{st.t}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--tx)', lineHeight: 1.65, marginTop: 5 }}>{t(n.txt)}</div>
                </div>
              </div>
            );
          })()}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{tt('المعرض', 'Gallery')}</span><span style={{ fontSize: 10.5, color: 'var(--fnt)' }}>{tt('6 صور', '6 photos')}</span></div>
          <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
            {['store front', 'shelves', 'cooler'].map((lab) => (
              <div key={lab} style={{ flex: 1, height: 74, borderRadius: 12, background: 'repeating-linear-gradient(45deg,var(--dv) 0 9px,var(--chip) 9px 18px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ font: "500 7.5px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>{lab}</span></div>
            ))}
          </div>
        </div>
      )}

      {/* POSTS */}
      {s.tab === 'ps' && (
        <div style={{ padding: '14px 20px 90px', display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeUp .25s both' }}>
          <div style={{ fontSize: 11, color: 'var(--sub)', lineHeight: 1.7 }}>{tt('كل منشور يُذكر فيه هذا العميل عبر @ يظهر هنا تلقائيًا.', 'Every post mentioning this customer via @ appears here automatically.')}</div>
          {custPosts.map((p, i) => {
            const tn = tone(p.tone);
            return (
              <div key={p.id} style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 15px', animation: 'fadeUp .3s both', animationDelay: `${i * 40}ms` }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', background: p.av, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{p.ini}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t(p.by)}</div>
                    <div style={{ fontSize: 10, color: 'var(--fnt)', marginTop: 1 }}>{t(p.when)} · {t(p.act)}</div>
                  </div>
                  <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, color: tn.c, background: tn.bg, borderRadius: 7, padding: '3.5px 8px' }}>{t(p.kind)}</span>
                </div>
                {!!t(p.txt) && <div style={{ fontSize: 12.5, color: 'var(--tx)', lineHeight: 1.7, marginTop: 9 }}>{t(p.txt)}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9, borderTop: '1px solid var(--dv)', paddingTop: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--sub)' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="1.9"><path d="M12 20s-7-4.5-9-9a4.8 4.8 0 0 1 9-2.5A4.8 4.8 0 0 1 21 11c-2 4.5-9 9-9 9z" /></svg>{p.likes}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--sub)' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="1.9"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" /></svg>{p.comments}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CONTACTS */}
      {s.tab === 'ct' && (
        <div style={{ padding: '14px 20px 90px', display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeUp .25s both' }}>
          {sel.contacts.map((k, ki) => {
            const bmap: Record<string, { t: string; bg: string; c: string }> = {
              decision: { t: tt('صاحب القرار', 'Decision maker'), bg: 'var(--pri)', c: 'var(--onPri)' },
              buy: { t: tt('المشتريات', 'Purchasing'), bg: 'var(--priT)', c: 'var(--lnk)' },
              fin: { t: tt('المالية', 'Finance'), bg: 'var(--chip)', c: 'var(--sub)' },
            };
            const b = bmap[k.badge] || bmap.fin;
            const vTxt = k.v > 0 ? tt(`موثق ×${k.v}`, `verified ×${k.v}`) : tt('غير موثق — يحتاج تأكيد', 'Unverified — needs confirmation');
            const vC = k.v > 0 ? 'var(--grnTx)' : 'var(--ambTx)';
            const vLine = k.v > 0 ? tt(`آخر تحقق ${t(k.vWhen)} بواسطة ${t(k.vBy)}`, `last verified ${t(k.vWhen)} by ${t(k.vBy)}`) : tt('اضغط ✓ عند تأكيد الرقم ميدانيًا', 'Tap ✓ once you confirm the number in the field');
            const noteTxt = t(k.note);
            return (
              <div key={ki} style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--lnk)' }}>{k.ini}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><span style={{ fontSize: 13.5, fontWeight: 700 }}>{t(k.n)}</span><span style={{ fontSize: 9, fontWeight: 700, color: b.c, background: b.bg, borderRadius: 5, padding: '2px 7px' }}>{b.t}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{t(k.role)} · <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{k.phone}</span></div>
                  </div>
                  <span onClick={() => toast({ ar: `جارٍ الاتصال بـ${k.n.ar}…`, en: `Calling ${k.n.en}…` })} style={{ cursor: 'pointer', width: 34, height: 34, flex: 'none', borderRadius: '50%', background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="1.9"><path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg></span>
                  <span onClick={() => toast({ ar: `فتح واتساب مع ${k.n.ar}`, en: `Opening WhatsApp with ${k.n.en}` })} style={{ cursor: 'pointer', width: 34, height: 34, flex: 'none', borderRadius: '50%', background: 'var(--grnT)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--grn)" strokeWidth="1.9"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" /></svg></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, background: 'var(--bg)', borderRadius: 10, padding: '8px 11px' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: vC }}>{vTxt}</span>
                  <span style={{ fontSize: 10, color: 'var(--fnt)' }}>· {vLine}</span>
                  <span onClick={() => toast({ ar: 'سُجّل توثيقك — بانتظار مراجعة المشرف', en: 'Your verification was recorded — pending supervisor review' })} style={{ cursor: 'pointer', marginInlineStart: 'auto', fontSize: 10, fontWeight: 700, color: 'var(--grnTx)', border: '1.5px solid var(--grn)', borderRadius: 8, padding: '4px 10px', transition: 'transform .15s' }}>{tt('✓ أؤكد الرقم', '✓ Confirm number')}</span>
                </div>
                {!!noteTxt && <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 8, lineHeight: 1.6 }}>{tt('ملاحظة: ', 'Note: ')}{noteTxt}</div>}
              </div>
            );
          })}
          <div onClick={() => toast({ ar: 'فتح نموذج إضافة مسؤول جديد', en: 'Opening the new contact form' })} style={{ cursor: 'pointer', border: '1.5px dashed var(--bd)', borderRadius: 16, padding: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--lnk)', fontSize: 12.5, fontWeight: 700, transition: 'all .15s' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>{tt('إضافة مسؤول جديد', 'Add a new contact')}</div>
        </div>
      )}

      {/* PAYMENT */}
      {s.tab === 'pay' && (
        <div style={{ padding: '14px 20px 90px', display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeUp .25s both' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '15px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 13, fontWeight: 700 }}>{tt('درجة الدفع الائتمانية', 'Credit payment grade')}</span><span style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt(`من ${sel.pay.reports} تقريرًا موثقًا`, `from ${sel.pay.reports} verified reports`)}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 13 }}>
              <span style={{ fontSize: 38, fontWeight: 700, lineHeight: 1, color: payGradeC, letterSpacing: '-1px' }}>{payGrade}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  {paySegs.map((bg, i) => <span key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: bg, transition: 'background .3s' }} />)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}><span style={{ fontSize: 9, color: 'var(--fnt)' }}>{tt('مرتفع الخطورة', 'High risk')}</span><span style={{ fontSize: 9, color: 'var(--fnt)' }}>{tt('ممتاز', 'Excellent')}</span></div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10 }}><span style={{ fontSize: 12.5, fontWeight: 700, color: payGradeC }}>{t(sel.pay.short)}</span><span style={{ fontSize: 11, color: 'var(--sub)' }}>· {tt('متوسط التأخير', 'avg delay')} {t(sel.pay.delay)}</span></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '11px 13px' }}><div style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt('الحد الائتماني', 'Credit limit')}</div><div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{t(sel.pay.credit)}</div></div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '11px 13px' }}><div style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt('حالة الائتمان', 'Credit status')}</div><div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{t(sel.pay.creditState)}</div></div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '11px 13px' }}><div style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt('متوسط التأخير', 'Average delay')}</div><div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{t(sel.pay.delay)}</div></div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '11px 13px' }}><div style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt('مستوى المخاطر', 'Risk level')}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: payRiskTone.d }} /><span style={{ fontSize: 14, fontWeight: 700, color: payRiskTone.c }}>{t(sel.pay.risk)}</span></div></div>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 16px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{tt('إشارة الدفع', 'Payment signal')}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: payG }}><span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--grn)', boxShadow: '0 0 0 5px var(--grnT)' }} /><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--grnTx)' }}>{tt('منتظم', 'Regular')}</span></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: payY }}><span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--amb)', boxShadow: '0 0 0 5px var(--ambT)' }} /><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ambTx)' }}>{tt('متابعة', 'Monitor')}</span></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: payR }}><span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 0 5px var(--redT)' }} /><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--redTx)' }}>{tt('توقف', 'Stop')}</span></span>
            </div>
          </div>
        </div>
      )}

      {/* MOVEMENT */}
      {s.tab === 'mv' && (
        <div style={{ padding: '14px 20px 90px', display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeUp .25s both' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '15px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 13, fontWeight: 700 }}>{tt('عدّاد سرعة الحركة', 'Movement speed meter')}</span><span style={{ fontSize: 10, color: 'var(--fnt)' }}>{tt('إعادة الطلب', 'Reorder')} {t(sel.move.days)}</span></div>
            <div style={{ position: 'relative', height: 12, borderRadius: 6, marginTop: 16, background: 'linear-gradient(-90deg,var(--red) 0 33%,var(--amb) 33% 66%,var(--grn) 66% 100%)', opacity: 0.9 }} />
            <div style={{ position: 'relative', height: 0 }}>
              <span style={{ position: 'absolute', top: -19, insetInlineStart: mvPos, transform: 'translateX(50%)', width: 4, height: 26, borderRadius: 2, background: 'var(--tx)', boxShadow: '0 1px 4px rgba(0,0,0,.3)', transition: 'inset-inline-start .5s cubic-bezier(.22,1,.36,1)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}><span style={{ fontSize: 9.5, color: 'var(--fnt)' }}>{tt('بطيئة', 'Slow')}</span><span style={{ fontSize: 9.5, color: 'var(--fnt)' }}>{tt('متوسطة', 'Medium')}</span><span style={{ fontSize: 9.5, color: 'var(--fnt)' }}>{tt('سريعة', 'Fast')}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}><span style={{ fontSize: 16, fontWeight: 700, color: col }}>{t(sel.move.speed)}</span><span style={{ fontSize: 11, color: 'var(--sub)' }}>· {tt('متوسط الطلبية', 'avg order')} {t(sel.avg)}</span></div>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, fontWeight: 700 }}>{tt('اتجاه المبيعات — 6 أشهر', 'Sales trend — 6 months')}</span></div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 64, marginTop: 12 }}>
              {trend.map((b, i) => <span key={i} style={{ flex: 1, height: b.h, borderRadius: '4px 4px 2px 2px', background: b.bg, transition: 'height .5s cubic-bezier(.22,1,.36,1)' }} />)}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 10 }}>{t(sel.move.catLine)}</div>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 16px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{tt('الفئات الأفضل مبيعًا', 'Best-selling categories')}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {sel.move.cats.map((g, i) => <span key={i} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--lnk)', background: 'var(--priT)', borderRadius: 9, padding: '6px 12px' }}>{t(g)}</span>)}
            </div>
          </div>
        </div>
      )}

      {/* NOTES */}
      {s.tab === 'nt' && (
        <div style={{ padding: '14px 20px 90px', animation: 'fadeUp .25s both' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sel.notes.map((n, ni) => {
              const st = stPill(n.st);
              const tn = tone(st.k);
              return (
                <div key={ni} style={{ display: 'flex', gap: 11 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: n.av, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>{n.ini}</div>
                    <span style={{ width: 2, flex: 1, background: 'var(--dv)', margin: '4px 0' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '11px 13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}><span style={{ fontSize: 12.5, fontWeight: 700 }}>{t(n.by)}</span><span style={{ fontSize: 10, color: 'var(--fnt)' }}>{t(n.when)}</span><span style={{ marginInlineStart: 'auto', fontSize: 9, fontWeight: 700, color: tn.c, background: tn.bg, borderRadius: 6, padding: '2.5px 7px' }}>{st.t}</span></div>
                      <div style={{ fontSize: 12.5, color: 'var(--tx)', lineHeight: 1.7, marginTop: 6 }}>{t(n.txt)}</div>
                      {n.img && (
                        <div style={{ height: 84, borderRadius: 11, marginTop: 9, background: 'repeating-linear-gradient(45deg,var(--dv) 0 9px,var(--chip) 9px 18px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ font: "500 8px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>attached photo</span></div>
                      )}
                      {n.voice && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9, background: 'var(--bg)', borderRadius: 11, padding: '8px 11px' }}>
                          <span style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M7 5v14l11-7z" /></svg></span>
                          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2.5 }}>{[7, 13, 9, 15, 8, 12, 10].map((h, k) => <span key={k} style={{ width: 3, height: h, borderRadius: 2, background: k % 2 ? 'var(--sub)' : 'var(--fnt)' }} />)}</span>
                          <span style={{ font: "500 9px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>0:42</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9, borderTop: '1px solid var(--dv)', paddingTop: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--sub)' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="1.9"><path d="M12 20s-7-4.5-9-9a4.8 4.8 0 0 1 9-2.5A4.8 4.8 0 0 1 21 11c-2 4.5-9 9-9 9z" /></svg>{n.likes}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--sub)' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="1.9"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" /></svg>{n.comments}</span>
                        <span style={{ marginInlineStart: 'auto', fontSize: 10, color: 'var(--fnt)' }}>{tt('سجل التعديلات محفوظ', 'Edit history saved')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div onClick={startReportHere} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 99, padding: '11px 16px', marginTop: 4, transition: 'transform .15s' }}>
            <span style={{ fontSize: 12.5, color: 'var(--fnt)', flex: 1 }}>{tt('أضف ملاحظة أو تقريرًا…', 'Add a note or report…')}</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="1.9"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="1.9"><rect x="3" y="7" width="18" height="13" rx="2.5" /><circle cx="12" cy="13" r="3.5" /><path d="M8.5 7 10 4h4l1.5 3" /></svg>
          </div>
        </div>
      )}

      {/* GALLERY */}
      {s.tab === 'gl' && (
        <div style={{ padding: '14px 20px 90px', animation: 'fadeUp .25s both' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {galleryTiles.map((g, i) => (
              <div key={i} style={{ height: 104, borderRadius: 14, background: 'repeating-linear-gradient(45deg,var(--dv) 0 9px,var(--chip) 9px 18px)', position: 'relative', overflow: 'hidden' }}>
                <span style={{ position: 'absolute', bottom: 8, insetInlineEnd: 9, fontSize: 9.5, fontWeight: 700, color: 'var(--tx)', background: 'var(--card)', borderRadius: 6, padding: '3px 8px', boxShadow: '0 1px 3px var(--sh)' }}>{g}</span>
              </div>
            ))}
            <div onClick={() => toast({ ar: 'فتح الكاميرا…', en: 'Opening the camera…' })} style={{ cursor: 'pointer', height: 104, borderRadius: 14, border: '1.5px dashed var(--bd)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--lnk)', transition: 'all .15s' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth="2"><rect x="3" y="7" width="18" height="13" rx="2.5" /><circle cx="12" cy="13" r="3.5" /><path d="M8.5 7 10 4h4l1.5 3" /></svg>
              <span style={{ fontSize: 10.5, fontWeight: 700 }}>{tt('إضافة صورة', 'Add photo')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function History() {
  const { s, data, back } = useApp();
  const { t, tt } = useI18n();
  const sel = data.customers.find((c) => c.id === s.selId) ?? data.customers[0];

  const stPill = (st: ApprovalStatus): { t: string; k: ToneKey } =>
    st === 'approved' ? { t: tt('معتمد', 'Approved'), k: 'g' } : st === 'rejected' ? { t: tt('مرفوض', 'Rejected'), k: 'r' } : { t: tt('قيد المراجعة', 'Pending'), k: 'a' };

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
        <span onClick={back} style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx)" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg></span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{tt('سجل التغييرات', 'Change history')}</div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 1 }}>{t(sel.name)} — {tt('لا يُحذف أي سجل، أبدًا', 'no record is ever deleted')}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12, paddingBottom: 26 }}>
        {sel.hist.map((h, i) => {
          const st = stPill(h.st);
          const tn = tone(st.k);
          return (
            <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 12.5, fontWeight: 700 }}>{t(h.f)}</span><span style={{ marginInlineStart: 'auto', fontSize: 9, fontWeight: 700, color: tn.c, background: tn.bg, borderRadius: 6, padding: '2.5px 7px' }}>{st.t}</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: 'var(--fnt)', textDecoration: 'line-through' }}>{t(h.old)}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--fnt)" strokeWidth="2" style={{ transform: 'scaleX(-1)' }}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--grnTx)' }}>{t(h.nw)}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--fnt)', marginTop: 7 }}>{t(h.by)} · {t(h.when)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
