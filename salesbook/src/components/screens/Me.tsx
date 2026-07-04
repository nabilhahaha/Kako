'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { tone } from '@/lib/tokens';

const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fnt)" strokeWidth={2}><path d="m15 6-6 6 6 6" /></svg>
);

export function Me() {
  const { s, nav, root } = useApp();
  const { tt } = useI18n();

  const reqPend = Object.values(s.requests).filter((v) => v === 'pending').length;
  const revPend = Object.values(s.reviews).filter((v) => v === 'pending').length;
  const msgUnread = 2;
  const availTxt = s.availOn
    ? tt('ملفك مرئي الآن — اكتمال السيرة 80%', 'Your profile is visible now — 80% complete')
    : tt('فعّل الظهور لتصلك دعوات الشركات', 'Enable visibility to receive company invites');
  const availDotC = s.availOn ? 'var(--grn)' : 'var(--fnt)';

  const meStats = [
    { n: '84', t: tt('تقرير معتمد', 'Approved reports') },
    { n: '129', t: tt('عميل محدّث', 'Updated customers') },
    { n: '210', t: tt('صورة مرفوعة', 'Photos uploaded') },
    { n: '46', t: tt('جهة موثقة', 'Verified contacts') },
  ];
  const badges = [
    { t: tt('موثِّق ذهبي', 'Gold Verifier'), tone: 'a' as const },
    { t: tt('عين الصقر', 'Eagle Eye'), tone: 'b' as const },
    { t: tt('مراسل نشط', 'Active Reporter'), tone: 'g' as const },
    { t: tt('عضو مؤسس', 'Founding Member'), tone: 'n' as const },
  ];

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ height: 86, background: 'repeating-linear-gradient(45deg,var(--dv) 0 10px,var(--chip) 10px 20px)', position: 'relative', flex: 'none' }}>
        <span style={{ position: 'absolute', bottom: 8, insetInlineStart: 12, font: "500 8px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>cover</span>
        <span onClick={() => nav('settings')} style={{ cursor: 'pointer', position: 'absolute', top: 10, insetInlineStart: 12, width: 34, height: 34, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx)" strokeWidth={1.8}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z" /></svg>
        </span>
      </div>
      <div style={{ padding: '0 20px', marginTop: -30 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ width: 74, height: 74, flex: 'none', borderRadius: '50%', background: 'var(--pri)', border: '3px solid var(--bg)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>{tt('أش', 'AS')}</div>
          <div style={{ flex: 1, paddingBottom: 6 }}>
            <div style={{ fontSize: 17.5, fontWeight: 700 }}>{tt('أحمد الشمري', 'Ahmed Al-Shammari')}</div>
            <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 2 }}>{tt('مشرف مبيعات · شركة التوزيع الوطنية · الرياض', 'Sales Supervisor · National Distribution Co. · Riyadh')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--sub)' }}><span style={{ fontWeight: 700, color: 'var(--tx)' }}>182</span> {tt('معرفة', 'connections')}</span>
          <span style={{ fontSize: 11, color: 'var(--sub)' }}><span style={{ fontWeight: 700, color: 'var(--tx)' }}>96</span> {tt('متابعًا', 'followers')}</span>
          <span style={{ fontSize: 11, color: 'var(--sub)' }}>{tt('عضو منذ 2024', 'Member since 2024')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '12px 14px' }}>
          <div style={{ flex: 'none', width: 50, height: 50, borderRadius: '50%', background: 'conic-gradient(var(--grn) 0 86%,var(--dv) 86% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 39, height: 39, borderRadius: '50%', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--grnTx)' }}>1,240</span></div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{tt('نقاط السمعة المهنية', 'Professional reputation points')}</div>
            <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 2 }}>{tt('المرتبة 3 في الرياض · +45 هذا الأسبوع', 'Rank 3 in Riyadh · +45 this week')}</div>
          </div>
          <span onClick={() => nav('leaderboard')} style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 700, color: 'var(--lnk)', background: 'var(--priT)', borderRadius: 9, padding: '7px 11px', transition: 'transform .15s' }}>{tt('المتصدرون', 'Leaderboard')}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 10 }}>
          {meStats.map((st, i) => (
            <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 13, padding: '10px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{st.n}</div>
              <div style={{ fontSize: 9, color: 'var(--sub)', marginTop: 3 }}>{st.t}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
          {badges.map((b, i) => {
            const tn = tone(b.tone);
            return (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: tn.c, background: tn.bg, borderRadius: 99, padding: '6px 12px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: tn.d }} />{b.t}</span>
            );
          })}
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, marginTop: 14, overflow: 'hidden' }}>
          <div onClick={() => nav('network')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderBottom: '1px solid var(--dv)', transition: 'background .15s' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth={1.9}><circle cx="9" cy="9" r="3.5" /><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5" /><path d="M16.5 4.5a3.5 3.5 0 0 1 0 7M18.5 14.7c2 .9 3.2 2.6 3.2 5" /></svg>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{tt('شبكتي المهنية', 'My professional network')}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--org)', background: 'var(--orgT)', borderRadius: 99, padding: '3px 8px' }}>{tt('طلبان جديدان', '2 new requests')}</span>
            <Chevron />
          </div>
          <div onClick={() => nav('messages')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderBottom: '1px solid var(--dv)', transition: 'background .15s' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth={1.9}><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" /></svg>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{tt('الرسائل', 'Messages')}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--onPri)', background: 'var(--pri)', borderRadius: 99, padding: '3px 8px' }}>{msgUnread}</span>
            <Chevron />
          </div>
          <div onClick={() => nav('groups')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderBottom: '1px solid var(--dv)', transition: 'background .15s' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth={1.9}><rect x="3" y="5" width="18" height="15" rx="2.5" /><path d="M3 10h18M9 20v-10" /></svg>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{tt('المجموعات المهنية', 'Professional groups')}</span>
            <Chevron />
          </div>
          <div onClick={() => nav('events')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', transition: 'background .15s' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth={1.9}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{tt('الفعاليات والتدريب', 'Events & training')}</span>
            <Chevron />
          </div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, marginTop: 10, overflow: 'hidden' }}>
          <div onClick={() => nav('review')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderBottom: '1px solid var(--dv)', transition: 'background .15s' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--org)" strokeWidth={1.9}><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{tt('قائمة المراجعة', 'Review queue')}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ambTx)', background: 'var(--ambT)', borderRadius: 99, padding: '3px 8px' }}>{tt(`${revPend} تحديثات · مشرف`, `${revPend} updates · Supervisor`)}</span>
            <Chevron />
          </div>
          <div onClick={() => nav('admin')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderBottom: '1px solid var(--dv)', transition: 'background .15s' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--org)" strokeWidth={1.9}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /><path d="M18 8l2 2 4-4" transform="translate(-3 3) scale(.8)" /></svg>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{tt('طلبات العضوية', 'Membership requests')}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--orgTx)', background: 'var(--orgT)', borderRadius: 99, padding: '3px 8px' }}>{tt(`${reqPend} بانتظارك · مسؤول`, `${reqPend} awaiting you · Admin`)}</span>
            <Chevron />
          </div>
          <div onClick={() => root('careers')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderBottom: '1px solid var(--dv)', transition: 'background .15s' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--grn)" strokeWidth={1.9}><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{tt('ملفي الوظيفي', 'My career profile')}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: availDotC }}>● {availTxt}</span>
            <Chevron />
          </div>
          <div onClick={() => nav('settings')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderBottom: '1px solid var(--dv)', transition: 'background .15s' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth={1.8}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z" /></svg>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{tt('الإعدادات', 'Settings')}</span>
            <Chevron />
          </div>
          <div onClick={() => root('login')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', transition: 'background .15s' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth={1.9}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11" /></svg>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--redTx)' }}>{tt('تسجيل الخروج', 'Log out')}</span>
          </div>
        </div>
        <div style={{ height: 96 }} />
      </div>
    </div>
  );
}
