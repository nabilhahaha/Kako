'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Icon } from '@/components/ui';
import type { Job, Talent } from '@/lib/types';

function Bell() {
  const { s, set } = useApp();
  const unread = s.notifRead ? 0 : 4;
  return (
    <div onClick={() => set({ screen: 'notif', stack: ['home'] })} style={{ cursor: 'pointer', position: 'relative', width: 40, height: 40, flex: 'none', borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}>
      <Icon name="bell" size={17} stroke="var(--tx)" />
      {unread > 0 && <span style={{ position: 'absolute', top: 6, insetInlineStart: 7, minWidth: 15, height: 15, background: 'var(--org)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg)', padding: '0 2px' }}>{unread}</span>}
    </div>
  );
}

function JobCard({ j, i }: { j: Job; i: number }) {
  const { s, update, nav, toast } = useApp();
  const { t, tt } = useI18n();
  const ap = !!s.applied[j.id];
  const apply = () => {
    if (ap) { toast({ ar: 'قدّمت بالفعل — ستصلك الحالة هنا', en: 'Already applied — you’ll get the status here' }); return; }
    update((p) => ({ applied: { ...p.applied, [j.id]: true } }));
    toast({ ar: 'أُرسل ملفك وسيرتك للشركة — تابع الحالة في التنبيهات', en: 'Your profile & CV were sent to the company — track the status in notifications' });
  };
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '14px 15px', animation: 'fadeUp .3s both', animationDelay: `${i * 50}ms` }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
        <div style={{ width: 46, height: 46, flex: 'none', borderRadius: 13, background: 'var(--priT)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--lnk)' }}>{j.ini}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t(j.t)}</div>
          <div onClick={() => nav('company')} style={{ cursor: 'pointer', fontSize: 11, color: 'var(--lnk)', fontWeight: 600, marginTop: 2 }}>{t(j.co)} · {t(j.city)}</div>
        </div>
        <span style={{ fontSize: 9.5, color: 'var(--fnt)' }}>{t(j.when)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--grnTx)', background: 'var(--grnT)', borderRadius: 8, padding: '5px 10px' }}>{t(j.sal)}</span>
        {j.tags.map((tg, k) => (
          <span key={k} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--sub)', background: 'var(--chip)', borderRadius: 8, padding: '5px 10px' }}>{t(tg)}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
        <span onClick={apply} style={{ cursor: 'pointer', flex: 1, height: 42, borderRadius: 12, background: ap ? 'var(--grnT)' : 'var(--pri)', color: ap ? 'var(--grnTx)' : 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, transition: 'all .2s' }}>{ap ? tt('✓ تم التقديم', '✓ Applied') : tt('تقدّم بنقرة', 'Apply in one tap')}</span>
        <span onClick={() => toast({ ar: 'حُفظت الوظيفة في قائمتك', en: 'Job saved to your list' })} style={{ cursor: 'pointer', width: 44, height: 42, flex: 'none', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="1.9"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--fnt)', marginTop: 9 }}>{tt('التقديم بنقرة يرسل ملفك المهني وسيرتك ونقاط سمعتك تلقائيًا', 'One-tap apply automatically sends your professional profile, CV & reputation points')}</div>
    </div>
  );
}

function TalentCard({ tl }: { tl: Talent }) {
  const { toast } = useApp();
  const { t, tt } = useI18n();
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '14px 15px' }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
        <div style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--lnk)' }}>{tl.ini}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t(tl.n)}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--grnTx)', background: 'var(--grnT)', borderRadius: 5, padding: '2px 6px' }}>{tt('متاح', 'Available')}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{t(tl.exp)} · {t(tl.city)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--grnTx)' }}>{tl.pts}</div>
          <div style={{ fontSize: 8.5, color: 'var(--fnt)' }}>{tt('سمعة', 'reputation')}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {tl.tags.map((tg, k) => (
          <span key={k} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--sub)', background: 'var(--chip)', borderRadius: 8, padding: '5px 10px' }}>{t(tg)}</span>
        ))}
        <span onClick={() => toast({ ar: `فُتحت محادثة مع ${tl.n.ar}`, en: `Chat opened with ${tl.n.en}` })} style={{ cursor: 'pointer', marginInlineStart: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--pri)', background: 'var(--priT)', borderRadius: 10, padding: '8px 14px', transition: 'transform .15s' }}>{tt('تواصل', 'Contact')}</span>
      </div>
    </div>
  );
}

export function Careers() {
  const { s, data, set, update, nav, toast } = useApp();
  const { tt } = useI18n();

  const swAvail = () => {
    update((p) => ({ availOn: !p.availOn }));
    toast(s.availOn
      ? { ar: 'أُخفي ملفك عن الشركات', en: 'Your profile is now hidden from companies' }
      : { ar: 'ملفك الوظيفي مرئي الآن للشركات الموظِّفة', en: 'Your job profile is now visible to hiring companies' });
  };
  const on = s.availOn;
  const jobsTab = s.careersTab === 'jobs';

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px 0' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{tt('الوظائف والفرص', 'Jobs & Opportunities')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 1 }}>{tt('توظيف مبني على السمعة المهنية الموثقة', 'Hiring built on verified professional reputation')}</div>
        </div>
        <Bell />
      </div>

      <div style={{ margin: '12px 20px 0', background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{tt('متاح للعمل', 'Available for work')}</div>
            <div style={{ fontSize: 10.5, marginTop: 2, color: on ? 'var(--grn)' : 'var(--fnt)' }}>● {on ? tt('ملفك مرئي الآن — اكتمال السيرة 80%', 'Your profile is visible now — CV 80% complete') : tt('فعّل الظهور لتصلك دعوات الشركات', 'Turn on visibility to receive company invitations')}</div>
          </div>
          <span onClick={swAvail} style={{ cursor: 'pointer', width: 46, height: 28, flex: 'none', borderRadius: 99, background: on ? 'var(--grn)' : 'var(--dv)', position: 'relative', transition: 'background .25s' }}>
            <span style={{ position: 'absolute', top: 3, insetInlineStart: 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.25)', transform: on ? 'translateX(-18px)' : 'translateX(0)', transition: 'transform .25s cubic-bezier(.22,1,.36,1)' }} />
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 11, borderTop: '1px solid var(--dv)', paddingTop: 11 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--dv)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: '80%', borderRadius: 3, background: 'var(--grn)' }} /></div>
          <span style={{ fontSize: 10, color: 'var(--sub)' }}>{tt('اكتمال السيرة 80%', 'CV 80% complete')}</span>
          <span style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 700, color: 'var(--lnk)' }}>{tt('إكمال', 'Complete')}</span>
        </div>
      </div>

      {/* recruiter entry — SalesBook Business */}
      <div onClick={() => nav('hiring')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, margin: '12px 20px 0', background: 'linear-gradient(135deg, var(--pri) 0%, var(--acc) 100%)', borderRadius: 18, padding: '14px 16px', boxShadow: 'var(--shadow-md)' }}>
        <span style={{ width: 42, height: 42, flex: 'none', borderRadius: 13, background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{tt('هل توظّف؟ استوديو التوظيف', 'Hiring? Open the Hiring Studio')}</div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.85)', marginTop: 2 }}>{tt('بحث ذكي · مرشحون موصى بهم · إدارة مقابلات', 'Smart search · recommended candidates · interview management')}</div>
        </div>
        <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: 'var(--pri)', background: '#fff', borderRadius: 10, padding: '8px 13px' }}>{tt('افتح', 'Open')}</span>
      </div>

      <div onClick={() => nav('leaderboard')} style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 20px 0', background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '12px 14px', cursor: 'pointer' }}>
        <div style={{ flex: 'none', width: 50, height: 50, borderRadius: '50%', background: 'conic-gradient(var(--grn) 0 86%,var(--dv) 86% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 39, height: 39, borderRadius: '50%', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--grnTx)' }}>1,240</span></div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{tt('نقاط السمعة المهنية', 'Professional reputation points')}</div>
          <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 2 }}>{tt('المرتبة 3 في الرياض · +45 هذا الأسبوع', 'Rank 3 in Riyadh · +45 this week')}</div>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--lnk)', background: 'var(--priT)', borderRadius: 9, padding: '7px 11px', transition: 'transform .15s' }}>{tt('المتصدرون', 'Leaderboard')}</span>
      </div>

      <div style={{ display: 'flex', background: 'var(--chip)', borderRadius: 12, padding: 3, margin: '12px 20px 0' }}>
        <span onClick={() => set({ careersTab: 'jobs' })} style={{ cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '8px 0', borderRadius: 10, background: jobsTab ? 'var(--card)' : 'transparent', color: jobsTab ? 'var(--tx)' : 'var(--fnt)', boxShadow: jobsTab ? '0 1px 3px var(--sh)' : 'none', transition: 'all .2s' }}>{tt('وظائف شاغرة', 'Open jobs')}</span>
        <span onClick={() => set({ careersTab: 'tal' })} style={{ cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '8px 0', borderRadius: 10, background: !jobsTab ? 'var(--card)' : 'transparent', color: !jobsTab ? 'var(--tx)' : 'var(--fnt)', boxShadow: !jobsTab ? '0 1px 3px var(--sh)' : 'none', transition: 'all .2s' }}>{tt('باحثون عن عمل', 'Job seekers')}</span>
      </div>

      {jobsTab ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 20px 96px' }}>
          {data.jobs.map((j, i) => <JobCard key={j.id} j={j} i={i} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 20px 96px' }}>
          {data.talents.map((tl, i) => <TalentCard key={i} tl={tl} />)}
        </div>
      )}
    </div>
  );
}
