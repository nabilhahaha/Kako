'use client';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight, ArrowLeft, BadgeCheck, Briefcase, Users, Bookmark, BookmarkCheck,
  CalendarClock, Search, Sparkles, MessageCircle, CheckCircle2, Send, Star,
} from 'lucide-react';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import type { L, Talent } from '@/lib/types';

const l = (ar: string, en: string): L => ({ ar, en });

const card: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 20, boxShadow: 'var(--shadow-sm)',
};

/* Interview pipeline seed (statuses live in app state so actions persist per session). */
const MEETINGS: { id: string; n: L; ini: string; av: string; role: L; when: L }[] = [
  { id: 'm1', n: l('يوسف الحربي', 'Youssef Al-Harbi'), ini: 'يح', av: '#1F4ED8', role: l('مندوب مبيعات — قنوات التجزئة', 'Sales Rep — Retail Channels'), when: l('غدًا · 10:30 ص', 'Tomorrow · 10:30 AM') },
  { id: 'm2', n: l('ريم القحطاني', 'Reem Al-Qahtani'), ini: 'رق', av: '#059669', role: l('مشرف مبيعات', 'Sales Supervisor'), when: l('الأحد · 1:00 م', 'Sunday · 1:00 PM') },
  { id: 'm3', n: l('تركي العتيبي', 'Turki Al-Otaibi'), ini: 'تع', av: '#EA580C', role: l('مدير مبيعات منطقة', 'Regional Sales Manager'), when: l('الثلاثاء · 11:00 ص', 'Tuesday · 11:00 AM') },
];

const ptsNum = (p: string) => parseInt(p.replace(/[^0-9]/g, ''), 10) || 0;

function FilterRow({ label, value, options, onPick }: {
  label: string; value: string; options: { k: string; t: string }[]; onPick: (k: string) => void;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fnt)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div data-scroll="true" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        {options.map((o) => {
          const on = value === o.k;
          return (
            <button key={o.k} onClick={() => onPick(o.k)} style={{ flex: 'none', border: `1px solid ${on ? 'var(--pri)' : 'var(--bd)'}`, cursor: 'pointer', fontSize: 11.5, fontWeight: on ? 700 : 500, padding: '7px 13px', borderRadius: 99, background: on ? 'var(--pri)' : 'var(--card)', color: on ? 'var(--onPri)' : 'var(--sub)', transition: 'all .18s' }}>{o.t}</button>
          );
        })}
      </div>
    </div>
  );
}

function CandidateCard({ c, idx, match, i }: { c: Talent; idx: number; match: number; i: number }) {
  const { s, update, nav, openChat, toast } = useApp();
  const { t, tt } = useI18n();
  const key = `c${idx}`;
  const saved = !!s.savedCands[key];
  const interviewing = !!s.interviews[key];
  const toggleSave = () => {
    update((p) => ({ savedCands: { ...p.savedCands, [key]: !p.savedCands[key] } }));
    toast(saved ? { ar: 'أُزيل من المحفوظين', en: 'Removed from saved' } : { ar: 'حُفظ في قائمة المرشحين', en: 'Saved to your pipeline' });
  };
  const schedule = () => {
    if (interviewing) { toast({ ar: 'مقابلة مجدولة بالفعل', en: 'Interview already scheduled' }); return; }
    update((p) => ({ interviews: { ...p.interviews, [key]: 'sched' }, hTab: 'meet' }));
    toast({ ar: `جُدولت مقابلة مع ${c.n.ar} — أُرسلت الدعوة`, en: `Interview scheduled with ${c.n.en} — invite sent` });
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{ ...card, padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 48, height: 48, flex: 'none', borderRadius: '50%', background: 'var(--priT)', color: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 }}>{c.ini}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => nav('portfolio')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--tx)' }}>{t(c.n)}</button>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--grnTx)', background: 'var(--grnT)', borderRadius: 5, padding: '2px 6px' }}>{tt('متاح', 'Available')}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{t(c.exp)} · {t(c.city)}</div>
        </div>
        <div style={{ flex: 'none', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700, color: 'var(--pri)' }}><Sparkles size={13} aria-hidden />{match}%</div>
          <div style={{ fontSize: 8.5, color: 'var(--fnt)', marginTop: 1 }}>{tt('مطابقة', 'match')}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: 'var(--grnTx)', background: 'var(--grnT)', borderRadius: 8, padding: '4px 9px' }}><Star size={11} aria-hidden />{c.pts}</span>
        {(c.skills || []).map((sk, k) => (
          <span key={k} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--sub)', background: 'var(--chip)', borderRadius: 8, padding: '4px 9px' }}>{t(sk)}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => { openChat('t1'); }} style={{ flex: 1, border: 'none', cursor: 'pointer', height: 40, borderRadius: 12, background: 'var(--pri)', color: 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, fontWeight: 700 }}>
          <MessageCircle size={15} aria-hidden />{tt('تواصل مباشر', 'Contact')}
        </button>
        <button onClick={schedule} style={{ flex: 1, border: '1px solid var(--bd)', cursor: 'pointer', height: 40, borderRadius: 12, background: interviewing ? 'var(--grnT)' : 'var(--card)', color: interviewing ? 'var(--grnTx)' : 'var(--tx)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, fontWeight: 700, transition: 'all .2s' }}>
          <CalendarClock size={15} aria-hidden />{interviewing ? tt('✓ مجدولة', '✓ Scheduled') : tt('مقابلة', 'Interview')}
        </button>
        <button onClick={toggleSave} aria-label={saved ? tt('إزالة من المحفوظين', 'Remove from saved') : tt('حفظ المرشح', 'Save candidate')} style={{ width: 42, flex: 'none', border: '1px solid var(--bd)', cursor: 'pointer', height: 40, borderRadius: 12, background: saved ? 'var(--priT)' : 'var(--card)', color: saved ? 'var(--pri)' : 'var(--sub)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s' }}>
          {saved ? <BookmarkCheck size={16} aria-hidden /> : <Bookmark size={16} aria-hidden />}
        </button>
      </div>
    </motion.div>
  );
}

/* Recruiter suite: smart candidate search, saved pipeline, interview management. */
export function Hiring() {
  const { s, data, set, update, back, toast } = useApp();
  const { t, tt, dir } = useI18n();
  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;

  const cities = [
    { k: 'all', t: tt('كل المدن', 'All cities') }, { k: 'الرياض', t: tt('الرياض', 'Riyadh') },
    { k: 'جدة', t: tt('جدة', 'Jeddah') }, { k: 'الدمام', t: tt('الدمام', 'Dammam') },
  ];
  const exps = [
    { k: 'all', t: tt('كل الخبرات', 'Any experience') }, { k: '1-3', t: tt('1–3 سنوات', '1–3 yrs') },
    { k: '4-6', t: tt('4–6 سنوات', '4–6 yrs') }, { k: '7+', t: tt('7+ سنوات', '7+ yrs') },
  ];
  const cats = [
    { k: 'all', t: tt('كل الفئات', 'All categories') }, { k: 'تجزئة', t: tt('تجزئة', 'Retail') },
    { k: 'هايبر ماركت', t: tt('هايبر ماركت', 'Hypermarket') }, { k: 'جملة', t: tt('جملة', 'Wholesale') },
    { k: 'مشروبات', t: tt('مشروبات', 'Beverages') }, { k: 'ألبان', t: tt('ألبان', 'Dairy') },
  ];

  const results = useMemo(() => {
    const q = s.hQuery.trim().toLowerCase();
    return data.talents
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => {
        if (s.hCity !== 'all' && c.city.ar !== s.hCity) return false;
        const y = c.yrs ?? 0;
        if (s.hExp === '1-3' && !(y >= 1 && y <= 3)) return false;
        if (s.hExp === '4-6' && !(y >= 4 && y <= 6)) return false;
        if (s.hExp === '7+' && y < 7) return false;
        if (s.hCat !== 'all' && c.cat?.ar !== s.hCat) return false;
        if (q) {
          const hay = [c.n.ar, c.n.en, c.exp.ar, c.exp.en, c.city.ar, c.city.en, ...(c.skills || []).flatMap((x) => [x.ar, x.en])].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map(({ c, idx }) => {
        let match = 68 + Math.min(24, Math.round(ptsNum(c.pts) / 90));
        if (s.hCity !== 'all') match += 3;
        if (s.hCat !== 'all') match += 3;
        if (s.hExp !== 'all') match += 2;
        return { c, idx, match: Math.min(match, 99) };
      })
      .sort((a, b) => b.match - a.match);
  }, [data.talents, s.hQuery, s.hCity, s.hExp, s.hCat]);

  const savedList = results.length >= 0
    ? data.talents.map((c, idx) => ({ c, idx })).filter(({ idx }) => s.savedCands[`c${idx}`])
    : [];
  const savedCount = Object.values(s.savedCands).filter(Boolean).length;
  const meetCount = MEETINGS.length + Object.keys(s.interviews).filter((k) => k.startsWith('c')).length;

  const setMeet = (id: string, st: 'done' | 'offer') => {
    update((p) => ({ interviews: { ...p.interviews, [id]: st } }));
    toast(st === 'done' ? { ar: 'وُسمت المقابلة كمكتملة', en: 'Interview marked complete' } : { ar: 'أُرسل عرض العمل للمرشح 🎉', en: 'Job offer sent to the candidate 🎉' });
  };

  const tabs = [
    { k: 'search' as const, t: tt('بحث ذكي', 'Smart search'), icon: <Search size={14} aria-hidden /> },
    { k: 'saved' as const, t: tt(`محفوظون (${savedCount})`, `Saved (${savedCount})`), icon: <Bookmark size={14} aria-hidden /> },
    { k: 'meet' as const, t: tt('المقابلات', 'Interviews'), icon: <CalendarClock size={14} aria-hidden /> },
  ];

  const meetStatus = (id: string): 'sched' | 'done' | 'offer' => s.interviews[id] || 'sched';

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px 0' }}>
        <button onClick={back} aria-label={tt('رجوع', 'Back')} style={{ width: 38, height: 38, flex: 'none', border: '1px solid var(--bd)', cursor: 'pointer', borderRadius: 13, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx)' }}>
          <BackIcon size={17} strokeWidth={2} aria-hidden />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 18.5, fontWeight: 700, letterSpacing: '-0.3px' }}>{tt('استوديو التوظيف', 'Hiring Studio')}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 700, color: 'var(--pri)', background: 'var(--priT)', borderRadius: 99, padding: '3px 8px' }}><BadgeCheck size={11} aria-hidden />{tt('شركة موثقة', 'Verified company')}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 1 }}>{tt('التوزيع الوطنية · توظيف مبني على السمعة الموثقة', 'National Distribution · reputation-based hiring')}</div>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '14px 20px 0' }}>
        {[
          { v: data.jobs.length, l: tt('وظائف مفتوحة', 'Open jobs'), icon: <Briefcase size={15} aria-hidden />, c: 'var(--pri)', b: 'var(--priT)' },
          { v: data.talents.length, l: tt('مرشحون', 'Candidates'), icon: <Users size={15} aria-hidden />, c: 'var(--acc)', b: 'var(--accT)' },
          { v: savedCount, l: tt('محفوظون', 'Saved'), icon: <Bookmark size={15} aria-hidden />, c: 'var(--amb)', b: 'var(--ambT)' },
          { v: meetCount, l: tt('مقابلات', 'Interviews'), icon: <CalendarClock size={15} aria-hidden />, c: 'var(--grn)', b: 'var(--grnT)' },
        ].map((k, i) => (
          <div key={i} style={{ ...card, borderRadius: 16, padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 28, height: 28, borderRadius: 9, background: k.b, color: k.c, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{k.icon}</span>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{k.v}</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--sub)', textAlign: 'center' }}>{k.l}</span>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', background: 'var(--chip)', borderRadius: 14, padding: 3, margin: '14px 20px 0' }}>
        {tabs.map((tb) => {
          const on = s.hTab === tb.k;
          return (
            <button key={tb.k} onClick={() => set({ hTab: tb.k })} style={{ flex: 1, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '9px 0', borderRadius: 11, background: on ? 'var(--card)' : 'transparent', color: on ? 'var(--tx)' : 'var(--fnt)', boxShadow: on ? '0 1px 3px var(--sh)' : 'none', transition: 'all .2s' }}>{tb.icon}{tb.t}</button>
          );
        })}
      </div>

      {s.hTab === 'search' && (
        <>
          {/* smart search */}
          <div style={{ ...card, margin: '12px 20px 0', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 13, padding: '0 12px', height: 44 }}>
              <Search size={15} color="var(--fnt)" aria-hidden />
              <input
                value={s.hQuery} onChange={(e) => set({ hQuery: e.target.value })}
                placeholder={tt('ابحث بالاسم أو المهارة أو الفئة…', 'Search by name, skill or category…')}
                aria-label={tt('بحث المرشحين', 'Candidate search')}
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: 'var(--tx)' }}
              />
            </div>
            <FilterRow label={tt('المدينة', 'City')} value={s.hCity} options={cities} onPick={(k) => set({ hCity: k })} />
            <FilterRow label={tt('سنوات الخبرة', 'Experience')} value={s.hExp} options={exps} onPick={(k) => set({ hExp: k })} />
            <FilterRow label={tt('فئة FMCG', 'FMCG category')} value={s.hCat} options={cats} onPick={(k) => set({ hCat: k })} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 8px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700 }}><Sparkles size={15} color="var(--pri)" aria-hidden />{tt('مرشحون موصى بهم', 'Recommended candidates')}</span>
            <span style={{ fontSize: 11, color: 'var(--sub)' }}>{results.length} {tt('نتيجة', 'results')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px 24px' }}>
            {results.map(({ c, idx, match }, i) => <CandidateCard key={idx} c={c} idx={idx} match={match} i={i} />)}
            {results.length === 0 && (
              <div style={{ ...card, padding: '28px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{tt('لا نتائج مطابقة', 'No matching candidates')}</div>
                <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 4 }}>{tt('جرّب توسيع الفلاتر أو تعديل كلمات البحث', 'Try widening the filters or changing your search terms')}</div>
              </div>
            )}
          </div>
        </>
      )}

      {s.hTab === 'saved' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 20px 24px' }}>
          {savedList.map(({ c, idx }, i) => <CandidateCard key={idx} c={c} idx={idx} match={Math.min(68 + Math.round(ptsNum(c.pts) / 90), 99)} i={i} />)}
          {savedList.length === 0 && (
            <div style={{ ...card, padding: '30px 16px', textAlign: 'center' }}>
              <Bookmark size={26} color="var(--fnt)" style={{ margin: '0 auto' }} aria-hidden />
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10 }}>{tt('لا مرشحين محفوظين بعد', 'No saved candidates yet')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 4 }}>{tt('احفظ المرشحين من البحث الذكي لبناء خط مواهبك', 'Save candidates from Smart search to build your talent pipeline')}</div>
              <button onClick={() => set({ hTab: 'search' })} style={{ border: 'none', cursor: 'pointer', marginTop: 14, height: 40, padding: '0 18px', borderRadius: 12, background: 'var(--pri)', color: 'var(--onPri)', fontSize: 12, fontWeight: 700 }}>{tt('ابدأ البحث', 'Start searching')}</button>
            </div>
          )}
        </div>
      )}

      {s.hTab === 'meet' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 20px 24px' }}>
          {MEETINGS.map((m, i) => {
            const st = meetStatus(m.id);
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }} style={{ ...card, padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: m.av, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{m.ini}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{t(m.n)}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 2 }}>{t(m.role)}</div>
                  </div>
                  <span style={{
                    flex: 'none', fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '5px 10px',
                    color: st === 'offer' ? 'var(--grnTx)' : st === 'done' ? 'var(--sub)' : 'var(--ambTx)',
                    background: st === 'offer' ? 'var(--grnT)' : st === 'done' ? 'var(--chip)' : 'var(--ambT)',
                  }}>
                    {st === 'offer' ? tt('عرض مُرسل', 'Offer sent') : st === 'done' ? tt('مكتملة', 'Completed') : tt('مجدولة', 'Scheduled')}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 11.5, fontWeight: 600, color: 'var(--sub)' }}>
                  <CalendarClock size={14} aria-hidden />{t(m.when)}
                </div>
                {st !== 'offer' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                    {st === 'sched' && (
                      <button onClick={() => setMeet(m.id, 'done')} style={{ flex: 1, border: '1px solid var(--bd)', cursor: 'pointer', height: 38, borderRadius: 11, background: 'var(--card)', color: 'var(--tx)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11.5, fontWeight: 700 }}>
                        <CheckCircle2 size={14} aria-hidden />{tt('اكتملت المقابلة', 'Mark complete')}
                      </button>
                    )}
                    <button onClick={() => setMeet(m.id, 'offer')} style={{ flex: 1, border: 'none', cursor: 'pointer', height: 38, borderRadius: 11, background: 'var(--pri)', color: 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11.5, fontWeight: 700 }}>
                      <Send size={13} aria-hidden />{tt('إرسال عرض عمل', 'Send offer')}
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
          {data.talents.map((c, idx) => (s.interviews[`c${idx}`] ? (
            <div key={`c${idx}`} style={{ ...card, padding: '14px 16px' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: 'var(--priT)', color: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{c.ini}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{t(c.n)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 2 }}>{tt('يُنسَّق الموعد مع المرشح', 'Time being arranged with the candidate')}</div>
                </div>
                <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, color: 'var(--ambTx)', background: 'var(--ambT)', borderRadius: 99, padding: '5px 10px' }}>{tt('بانتظار التأكيد', 'Awaiting confirmation')}</span>
              </div>
            </div>
          ) : null))}
        </div>
      )}
    </div>
  );
}
