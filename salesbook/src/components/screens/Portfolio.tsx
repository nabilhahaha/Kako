'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight, ArrowLeft, BadgeCheck, Sparkles, Download, Play, Award, GraduationCap,
  Languages, MapPin, Tags, Rocket, Percent, Quote, TrendingUp, Flame, Target,
} from 'lucide-react';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import type { L } from '@/lib/types';

const l = (ar: string, en: string): L => ({ ar, en });

const card: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 20, boxShadow: 'var(--shadow-sm)',
};

/* ------------------------------------------------------------------ */
/* Portfolio dataset for the demo persona (Ahmed Al-Shammari).         */
/* ------------------------------------------------------------------ */
const P = {
  name: l('أحمد الشمري', 'Ahmed Al-Shammari'),
  title: l('مشرف مبيعات · شركة التوزيع الوطنية · الرياض', 'Sales Supervisor · National Distribution Co. · Riyadh'),
  vidLen: '1:12',
  strengths: [
    l('يرفع تغطية الرفوف بمعدل +18% خلال أول ٩٠ يومًا في كل قناة استلمها', 'Lifts shelf coverage by +18% within the first 90 days of every channel he takes over'),
    l('أعلى معدل تحصيل في فريقه ١٤ شهرًا متتاليًا مع صفر نزاعات دفع', 'Highest collection rate on his team for 14 straight months with zero payment disputes'),
    l('يوثّق كل زيارة بالصور والبيانات — ملفه مصدر موثوق لثلاث شركات موزعة', 'Documents every visit with photos and data — a trusted source for three distributors'),
  ],
  months: [
    { m: l('يناير', 'Jan'), v: 96 }, { m: l('فبراير', 'Feb'), v: 104 }, { m: l('مارس', 'Mar'), v: 99 },
    { m: l('أبريل', 'Apr'), v: 112 }, { m: l('مايو', 'May'), v: 107 }, { m: l('يونيو', 'Jun'), v: 95 },
    { m: l('يوليو', 'Jul'), v: 118 }, { m: l('أغسطس', 'Aug'), v: 109 }, { m: l('سبتمبر', 'Sep'), v: 101 },
    { m: l('أكتوبر', 'Oct'), v: 122 }, { m: l('نوفمبر', 'Nov'), v: 115 }, { m: l('ديسمبر', 'Dec'), v: 111 },
  ],
  kpis: [
    { icon: <Target size={16} aria-hidden />, v: '107%', t: l('متوسط تحقيق الهدف', 'Avg target attainment') },
    { icon: <Flame size={16} aria-hidden />, v: '9', t: l('أشهر فوق الهدف متتالية', 'Consecutive months over target') },
    { icon: <TrendingUp size={16} aria-hidden />, v: '122%', t: l('أفضل شهر (أكتوبر)', 'Best month (Oct)') },
  ],
  exp: [
    { r: l('مشرف مبيعات', 'Sales Supervisor'), co: l('شركة التوزيع الوطنية', 'National Distribution Co.'), per: l('2023 — الآن', '2023 — present'), wins: [l('قاد فريق ٦ مناديب لتجاوز الهدف ٤ أرباع متتالية', 'Led a team of 6 reps past target for 4 straight quarters'), l('أطلق تغطية قناة الهايبر في شمال الرياض من الصفر', 'Launched hypermarket coverage in North Riyadh from zero')] },
    { r: l('مندوب مبيعات أول', 'Senior Sales Rep'), co: l('شركة التوزيع الوطنية', 'National Distribution Co.'), per: l('2021 — 2023', '2021 — 2023'), wins: [l('أفضل مندوب في المنطقة الوسطى 2022', 'Top rep, Central Region 2022')] },
    { r: l('مندوب مبيعات', 'Sales Rep'), co: l('مؤسسة الخليج للتموين', 'Gulf Supplies Est.'), per: l('2019 — 2021', '2019 — 2021'), wins: [l('بنى قاعدة ٤٥ عميل تجزئة نشطًا في ١٨ شهرًا', 'Built a base of 45 active retail customers in 18 months')] },
  ],
  skills: [l('تفاوض', 'Negotiation'), l('تحصيل', 'Collections'), l('عرض أرفف', 'Shelf display'), l('تخطيط طرق', 'Route planning'), l('قيادة فريق', 'Team leadership'), l('إطلاق منتجات', 'Product launches')],
  cats: [l('مشروبات', 'Beverages'), l('حلويات', 'Confectionery'), l('ألبان', 'Dairy'), l('تجزئة', 'Retail'), l('هايبر ماركت', 'Hypermarket')],
  langs: [l('العربية — لغة أم', 'Arabic — native'), l('الإنجليزية — متقدم', 'English — advanced')],
  cities: [l('الرياض', 'Riyadh'), l('الخرج', 'Al-Kharj'), l('القصيم', 'Qassim')],
  certs: [
    { t: l('شهادة إدارة المبيعات الميدانية — الغرفة التجارية', 'Field Sales Management — Chamber of Commerce'), y: '2024' },
    { t: l('سلامة الغذاء وسلسلة التبريد — سابك أكاديمي', 'Food Safety & Cold Chain — SABIC Academy'), y: '2022' },
  ],
  awards: [
    { t: l('جائزة أفضل مشرف — التوزيع الوطنية', 'Best Supervisor Award — National Distribution'), y: '2025' },
    { t: l('أفضل مندوب في المنطقة الوسطى', 'Top Rep, Central Region'), y: '2022' },
  ],
  launches: [
    { t: l('إطلاق عصير روابي 330مل — 120 منفذ في أسبوعين', 'Rawabi Juice 330ml launch — 120 outlets in two weeks'), y: '2025' },
    { t: l('حملة رمضان للحلويات — نمو 34% عن العام السابق', 'Ramadan confectionery push — +34% YoY'), y: '2024' },
  ],
  promos: [
    { t: l('عرض «اشترِ ٢ واحصل على ١» — قناة البقالات', '“Buy 2 Get 1” — grocery channel'), r: l('+27% مبيعات الفئة خلال العرض', '+27% category sales during the promo') },
    { t: l('تخفيض نهاية الموسم — الهايبر', 'End-of-season markdown — hypermarkets'), r: l('تصريف 96% من المخزون الراكد', 'Cleared 96% of slow stock') },
  ],
  recs: [
    { by: l('خالد الراشد', 'Khaled Al-Rashed'), ini: 'خر', role: l('مدير مشتريات · أسواق النخيل', 'Purchasing Manager · Palm Markets'), kind: l('توصية عميل', 'Customer'), tone: 'g' as const, txt: l('أدق مندوب تعاملنا معه — بياناته قبل الزيارة توفر علينا ساعات', 'The most precise rep we deal with — his pre-visit data saves us hours') },
    { by: l('سلمان العمري', 'Salman Al-Amri'), ini: 'سع', role: l('مدير المبيعات الإقليمي', 'Regional Sales Manager'), kind: l('توصية مدير', 'Manager'), tone: 'b' as const, txt: l('يقود بالأرقام ويطور من حوله — جاهز لإدارة منطقة كاملة', 'Leads with numbers and grows the people around him — ready to run a full region') },
    { by: l('شركة التوزيع الوطنية', 'National Distribution Co.'), ini: 'تو', role: l('صاحب العمل الحالي', 'Current employer'), kind: l('توصية شركة', 'Company'), tone: 'a' as const, txt: l('موظف موثوق تجاوز أهدافه في ١١ شهرًا من أصل ١٢', 'A trusted performer — beat target in 11 of the last 12 months') },
  ],
  timeline: [
    { y: '2025', t: l('جائزة أفضل مشرف + قيادة إطلاق روابي', 'Best Supervisor award + led the Rawabi launch') },
    { y: '2023', t: l('ترقية إلى مشرف مبيعات', 'Promoted to Sales Supervisor') },
    { y: '2022', t: l('أفضل مندوب في المنطقة الوسطى', 'Top rep, Central Region') },
    { y: '2019', t: l('بداية المسيرة في مبيعات FMCG', 'Started in FMCG field sales') },
  ],
};

function Section({ icon, title, children, first }: { icon?: React.ReactNode; title: string; children: React.ReactNode; first?: boolean }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: `${first ? 18 : 22}px 20px 10px` }}>
        {icon && <span style={{ color: 'var(--pri)', display: 'flex' }}>{icon}</span>}
        <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.2px' }}>{title}</span>
      </div>
      {children}
    </>
  );
}

function ChipGroup({ items, tint }: { items: L[]; tint?: boolean }) {
  const { t } = useI18n();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
      {items.map((x, i) => (
        <span key={i} style={{ fontSize: 11.5, fontWeight: 600, color: tint ? 'var(--pri)' : 'var(--sub)', background: tint ? 'var(--priT)' : 'var(--chip)', borderRadius: 99, padding: '6px 13px' }}>{t(x)}</span>
      ))}
    </div>
  );
}

/* Monthly target attainment — single-series bar chart on the card surface.
   One brand hue, thin 4px-rounded bars, dashed 100% reference, selective labels,
   tap a bar to inspect its month. */
function TargetChart() {
  const { t, tt } = useI18n();
  const [sel, setSel] = useState<number>(P.months.length - 1);
  const max = 130;
  const H = 84;
  const best = P.months.reduce((a, b, i) => (b.v > P.months[a].v ? i : a), 0);
  return (
    <div style={{ ...card, margin: '0 20px', padding: '16px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{tt('تحقيق الهدف الشهري — آخر 12 شهرًا', 'Monthly target attainment — last 12 months')}</span>
      </div>
      <div style={{ position: 'relative', marginTop: 14, height: H }}>
        {/* 100% reference line */}
        <div style={{ position: 'absolute', insetInline: 0, bottom: (100 / max) * H, borderTop: '2px dashed var(--dv)' }} />
        <span style={{ position: 'absolute', insetInlineEnd: 0, bottom: (100 / max) * H + 3, fontSize: 8.5, fontWeight: 600, color: 'var(--fnt)' }}>100%</span>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: '100%' }}>
          {P.months.map((mo, i) => {
            const on = sel === i;
            return (
              <button
                key={i} onClick={() => setSel(i)}
                aria-label={`${t(mo.m)}: ${mo.v}%`}
                style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 0, position: 'relative' }}>
                {(i === best || on) && (
                  <span style={{ position: 'absolute', bottom: (mo.v / max) * H + 3, insetInlineStart: '50%', transform: 'translateX(50%)', fontSize: 8.5, fontWeight: 700, color: 'var(--tx)', whiteSpace: 'nowrap' }}>{mo.v}%</span>
                )}
                <span style={{
                  display: 'block', width: '100%', height: (mo.v / max) * H,
                  borderRadius: '4px 4px 0 0',
                  background: on ? 'var(--pri)' : 'var(--priT)',
                  outline: on ? 'none' : undefined,
                  transition: 'background .2s',
                }} />
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
        {P.months.map((mo, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 7.5, fontWeight: 600, color: sel === i ? 'var(--pri)' : 'var(--fnt)' }}>{t(mo.m).slice(0, 3)}</span>
        ))}
      </div>
      <div style={{ marginTop: 10, borderTop: '1px solid var(--dv)', paddingTop: 9, fontSize: 11.5, fontWeight: 600, color: 'var(--sub)' }}>
        {t(P.months[sel].m)} · <span style={{ color: 'var(--tx)', fontWeight: 700 }}>{P.months[sel].v}%</span> {tt('من الهدف', 'of target')}
        {sel === best && <span style={{ color: 'var(--grnTx)', fontWeight: 700 }}> · {tt('أفضل شهر', 'best month')} 🏆</span>}
      </div>
    </div>
  );
}

function GalleryStrip({ label, count, tag }: { label: string; count: number; tag: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sub)', margin: '0 20px 7px' }}>{label}</div>
      <div data-scroll="true" style={{ display: 'flex', gap: 8, padding: '0 20px', overflowX: 'auto' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{ flex: 'none', width: 116, height: 86, borderRadius: 14, border: '1px solid var(--bd)', background: 'repeating-linear-gradient(45deg,var(--dv) 0 9px,var(--chip) 9px 18px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ font: "500 8px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>{tag} {i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* World-class portfolio: the CV-replacing professional profile. */
export function Portfolio() {
  const { back, toast } = useApp();
  const { t, tt, dir, lang } = useI18n();
  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;

  const downloadResume = () => {
    const rows = P.exp.map((e) => `<li><b>${t(e.r)}</b> — ${t(e.co)} (${t(e.per)})</li>`).join('');
    const html = `<!doctype html><html dir="${dir}" lang="${lang}"><head><meta charset="utf-8"><title>${t(P.name)} — SalesBook Resume</title></head>
<body style="font-family:sans-serif;max-width:640px;margin:32px auto;line-height:1.7">
<h1 style="margin-bottom:0">${t(P.name)}</h1><p style="color:#555;margin-top:4px">${t(P.title)}</p>
<h2>${tt('الخبرات', 'Experience')}</h2><ul>${rows}</ul>
<h2>${tt('المهارات', 'Skills')}</h2><p>${P.skills.map((s) => t(s)).join(' · ')}</p>
<h2>${tt('الجوائز', 'Awards')}</h2><ul>${P.awards.map((a) => `<li>${t(a.t)} (${a.y})</li>`).join('')}</ul>
<p style="color:#888;font-size:12px">${tt('أُنشئ تلقائيًا من ملف SalesBook الموثق', 'Generated automatically from a verified SalesBook portfolio')}</p>
</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url; a.download = `salesbook-resume-${lang}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast({ ar: 'نُزّلت السيرة الذاتية — مولدة من ملفك الموثق', en: 'Resume downloaded — generated from your verified portfolio' });
  };

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {/* hero */}
      <div style={{ background: 'linear-gradient(135deg, var(--pri) 0%, var(--acc) 100%)', padding: '14px 20px 54px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={back} aria-label={tt('رجوع', 'Back')} style={{ width: 36, height: 36, border: 'none', cursor: 'pointer', borderRadius: 12, background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <BackIcon size={16} strokeWidth={2.2} aria-hidden />
          </button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,.18)', borderRadius: 99, padding: '6px 12px' }}>
            <BadgeCheck size={13} aria-hidden />{tt('ملف موثق — يغني عن السيرة الذاتية', 'Verified portfolio — replaces a CV')}
          </span>
        </div>
      </div>
      <div style={{ padding: '0 20px', marginTop: -38 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 13 }}>
          <div style={{ width: 76, height: 76, flex: 'none', borderRadius: 24, background: 'var(--pri)', border: '3px solid var(--bg)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 23, fontWeight: 700, boxShadow: 'var(--shadow-md)' }}>أش</div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>{t(P.name)}</span>
              <BadgeCheck size={17} color="var(--pri)" aria-label={tt('موثق', 'Verified')} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 3 }}>{t(P.title)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={downloadResume} style={{ flex: 1, border: 'none', cursor: 'pointer', height: 44, borderRadius: 14, background: 'var(--pri)', color: 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, boxShadow: 'var(--shadow-md)' }}>
            <Download size={15} aria-hidden />{tt('تحميل السيرة الذاتية', 'Download resume')}
          </button>
          <button onClick={() => toast({ ar: 'يُشغَّل الفيديو التعريفي (1:12)', en: 'Playing intro video (1:12)' })} style={{ flex: 1, border: '1px solid var(--bd)', cursor: 'pointer', height: 44, borderRadius: 14, background: 'var(--card)', color: 'var(--tx)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12.5, fontWeight: 700 }}>
            <Play size={15} color="var(--pri)" aria-hidden />{tt('فيديو تعريفي', 'Intro video')} · {P.vidLen}
          </button>
        </div>
      </div>

      {/* AI strengths */}
      <Section first icon={<Sparkles size={16} aria-hidden />} title={tt('ملخص القوة — مولد بالذكاء الاصطناعي', 'AI-generated strengths')}>
        <div style={{ margin: '0 20px', borderRadius: 20, padding: 1.5, background: 'linear-gradient(135deg, var(--pri), var(--acc))' }}>
          <div style={{ background: 'var(--card)', borderRadius: 18.5, padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {P.strengths.map((x, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.3 }} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <span style={{ width: 6, height: 6, flex: 'none', borderRadius: '50%', background: 'var(--pri)', marginTop: 7 }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.7, color: 'var(--tx)' }}>{t(x)}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* performance analytics */}
      <Section icon={<TrendingUp size={16} aria-hidden />} title={tt('تحليلات الأداء', 'Performance analytics')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '0 20px 10px' }}>
          {P.kpis.map((k, i) => (
            <div key={i} style={{ ...card, borderRadius: 16, padding: '11px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'var(--pri)' }}>{k.icon}</span>
              <span style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.3px' }}>{k.v}</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--sub)', textAlign: 'center', lineHeight: 1.4 }}>{t(k.t)}</span>
            </div>
          ))}
        </div>
        <TargetChart />
      </Section>

      {/* experience timeline */}
      <Section icon={<GraduationCap size={16} aria-hidden />} title={tt('المسيرة المهنية والإنجازات', 'Experience & achievements')}>
        <div style={{ ...card, margin: '0 20px', padding: '4px 16px' }}>
          {P.exp.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '13px 0', borderTop: i === 0 ? 'none' : '1px solid var(--dv)' }}>
              <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: i === 0 ? 'var(--pri)' : 'var(--dv)', border: i === 0 ? '2.5px solid var(--priT)' : 'none', marginTop: 4 }} />
                {i < P.exp.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--dv)', marginTop: 4 }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t(e.r)}</div>
                <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 1 }}>{t(e.co)} · {t(e.per)}</div>
                {e.wins.map((w, k) => (
                  <div key={k} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 6 }}>
                    <Award size={12} color="var(--amb)" style={{ flex: 'none', marginTop: 2 }} aria-hidden />
                    <span style={{ fontSize: 11.5, color: 'var(--sub)', lineHeight: 1.6 }}>{t(w)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* skills / categories / languages / cities */}
      <Section icon={<Tags size={16} aria-hidden />} title={tt('المهارات والتغطية', 'Skills & coverage')}>
        <div style={{ ...card, margin: '0 20px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          <ChipGroup items={P.skills} tint />
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fnt)', marginBottom: 7 }}>{tt('فئات FMCG', 'FMCG categories')}</div>
            <ChipGroup items={P.cats} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--sub)' }}><Languages size={13} color="var(--pri)" aria-hidden />{P.langs.map((x) => t(x)).join(' · ')}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--sub)' }}><MapPin size={13} color="var(--pri)" aria-hidden />{P.cities.map((x) => t(x)).join(' · ')}</span>
          </div>
        </div>
      </Section>

      {/* certifications & awards */}
      <Section icon={<Award size={16} aria-hidden />} title={tt('الشهادات والجوائز', 'Certifications & awards')}>
        <div style={{ ...card, margin: '0 20px', overflow: 'hidden' }}>
          {[...P.certs.map((c) => ({ ...c, kind: 'cert' as const })), ...P.awards.map((a) => ({ ...a, kind: 'award' as const }))].map((x, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--dv)' }}>
              <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 11, background: x.kind === 'award' ? 'var(--ambT)' : 'var(--priT)', color: x.kind === 'award' ? 'var(--amb)' : 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {x.kind === 'award' ? <Award size={16} aria-hidden /> : <GraduationCap size={16} aria-hidden />}
              </span>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, lineHeight: 1.5 }}>{t(x.t)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fnt)' }}>{x.y}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* field gallery */}
      <Section icon={<Rocket size={16} aria-hidden />} title={tt('معرض العمل الميداني', 'Field work gallery')}>
        <GalleryStrip label={tt('تنفيذ الأرفف', 'Shelf execution')} count={4} tag="shelf" />
        <GalleryStrip label={tt('زيارات السوق', 'Market visits')} count={4} tag="visit" />
        <GalleryStrip label={tt('إطلاقات المنتجات', 'Product launches')} count={3} tag="launch" />
        <div style={{ ...card, margin: '12px 20px 0', overflow: 'hidden' }}>
          {P.launches.map((x, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--dv)' }}>
              <Rocket size={15} color="var(--pri)" style={{ flex: 'none' }} aria-hidden />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>{t(x.t)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fnt)' }}>{x.y}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* promotions executed */}
      <Section icon={<Percent size={16} aria-hidden />} title={tt('عروض ترويجية نفذها', 'Promotions executed')}>
        <div style={{ ...card, margin: '0 20px', overflow: 'hidden' }}>
          {P.promos.map((x, i) => (
            <div key={i} style={{ padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--dv)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t(x.t)}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--grnTx)', marginTop: 4 }}>{t(x.r)}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* recommendations */}
      <Section icon={<Quote size={16} aria-hidden />} title={tt('التوصيات الموثقة', 'Verified recommendations')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px' }}>
          {P.recs.map((r, i) => (
            <div key={i} style={{ ...card, padding: '13px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 38, height: 38, flex: 'none', borderRadius: '50%', background: 'var(--chip)', color: 'var(--sub)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{r.ini}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t(r.by)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 1 }}>{t(r.role)}</div>
                </div>
                <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, color: r.tone === 'g' ? 'var(--grnTx)' : r.tone === 'b' ? 'var(--pri)' : 'var(--ambTx)', background: r.tone === 'g' ? 'var(--grnT)' : r.tone === 'b' ? 'var(--priT)' : 'var(--ambT)', borderRadius: 99, padding: '4px 9px' }}>{t(r.kind)}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--tx)', lineHeight: 1.7, marginTop: 9 }}>&ldquo;{t(r.txt)}&rdquo;</div>
            </div>
          ))}
        </div>
      </Section>

      {/* professional timeline */}
      <Section icon={<Flame size={16} aria-hidden />} title={tt('المحطات المهنية', 'Professional timeline')}>
        <div style={{ ...card, margin: '0 20px 26px', padding: '6px 16px' }}>
          {P.timeline.map((x, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 0', borderTop: i === 0 ? 'none' : '1px solid var(--dv)' }}>
              <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 700, color: 'var(--pri)', background: 'var(--priT)', borderRadius: 9, padding: '4px 9px' }}>{x.y}</span>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, lineHeight: 1.6, marginTop: 2 }}>{t(x.t)}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
