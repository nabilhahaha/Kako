'use client';
import { CSSProperties } from 'react';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { SCREENS } from './screens';
import { ErrorBoundary } from './ErrorBoundary';
import type { L } from '@/lib/types';

const NAV_SCREENS = ['home', 'customers', 'careers', 'notif', 'me'];

const tt = (ar: string, en: string): L => ({ ar, en });

/* reviewer quick-jump chip */
function Jump({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <span onClick={onClick} style={{
      cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#4A4A46', background: '#FFFFFF',
      border: '1px solid #DDDBD4', borderRadius: 99, padding: '6px 13px', userSelect: 'none',
    }}>{label}</span>
  );
}

function NavBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  const c = active ? 'var(--pri)' : 'var(--fnt)';
  return (
    <span onClick={onClick} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 56 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      <span style={{ fontSize: 10, fontWeight: 700, color: c }}>{label}</span>
    </span>
  );
}

export function AppShell() {
  const app = useApp();
  const { s, root, login, startReport, toggleTheme } = app;
  const { t, tt: T, dir, lang, toggleLang } = useI18n();
  const Screen = SCREENS[s.screen] || SCREENS.login;
  const showNav = NAV_SCREENS.includes(s.screen);

  const jumps: { label: string; go: () => void }[] = [
    { label: s.theme === 'dark' ? T('الوضع الفاتح', 'Light mode') : T('الوضع الداكن', 'Dark mode'), go: toggleTheme },
    { label: lang === 'ar' ? 'English' : 'العربية', go: toggleLang },
    { label: T('تسجيل الدخول', 'Login'), go: () => root('login') },
    { label: T('طلب عضوية', 'Register'), go: () => root('register') },
    { label: T('الرئيسية', 'Home'), go: () => login() },
    { label: T('العملاء', 'Customers'), go: () => root('customers') },
    { label: T('ملف العميل', 'Customer'), go: () => app.set({ screen: 'customer', stack: ['home'], selId: 'n1', tab: 'ov' }) },
    { label: T('تقرير جديد', 'New report'), go: () => { app.set({ screen: 'home', stack: [] }); startReport(null); } },
    { label: T('الوظائف', 'Careers'), go: () => root('careers') },
    { label: T('ملف شركة', 'Company'), go: () => app.set({ screen: 'company', stack: ['home', 'careers'] }) },
    { label: T('المتصدرون', 'Leaderboard'), go: () => app.set({ screen: 'leaderboard', stack: ['home', 'me'] }) },
    { label: T('شبكتي', 'Network'), go: () => app.set({ screen: 'network', stack: ['home'] }) },
    { label: T('الرسائل', 'Messages'), go: () => app.set({ screen: 'messages', stack: ['home'] }) },
    { label: T('محادثة', 'Chat'), go: () => app.set({ screen: 'chat', stack: ['home', 'messages'], chatId: 't1' }) },
    { label: T('المجموعات', 'Groups'), go: () => app.set({ screen: 'groups', stack: ['home'] }) },
    { label: T('الفعاليات', 'Events'), go: () => app.set({ screen: 'events', stack: ['home'] }) },
    { label: T('ملف زميل', 'Member'), go: () => app.set({ screen: 'member', stack: ['home', 'network'] }) },
    { label: T('البحث', 'Search'), go: () => app.set({ screen: 'search', stack: ['home'], query: '' }) },
    { label: T('التنبيهات', 'Notifications'), go: () => app.set({ screen: 'notif', stack: ['home'] }) },
    { label: T('حسابي', 'Profile'), go: () => app.set({ screen: 'me', stack: ['home'] }) },
    { label: T('الإعدادات', 'Settings'), go: () => app.set({ screen: 'settings', stack: ['home', 'me'] }) },
    { label: T('طلبات العضوية', 'Approvals'), go: () => app.set({ screen: 'admin', stack: ['home', 'me'] }) },
    { label: T('قائمة المراجعة', 'Review queue'), go: () => app.set({ screen: 'review', stack: ['home', 'me'] }) },
    { label: T('سجل التغييرات', 'History'), go: () => app.set({ screen: 'history', stack: ['home', 'customer'], selId: 'n1' }) },
  ];

  const phoneStyle: CSSProperties = {
    // fixed 390px device on wide screens; shrinks to fit narrow viewports (no horizontal overflow)
    width: 'min(390px, calc(100dvw - 24px))', maxWidth: 390, height: 'min(844px, calc(100dvh - 96px))',
    flex: 'none', background: 'var(--bg)', color: 'var(--tx)',
    border: '1px solid rgba(0,0,0,.1)', borderRadius: 30, overflow: 'hidden', display: 'flex',
    flexDirection: 'column', position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,.18)', transition: 'background .3s',
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '26px 12px 40px', boxSizing: 'border-box' }}>
      {/* quick-jump bar */}
      <div dir={dir} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 760 }}>
        {jumps.map((j, i) => <Jump key={i} label={j.label} onClick={j.go} />)}
      </div>

      {/* phone */}
      <div data-slk="true" data-th={s.theme} dir={dir} lang={lang} style={phoneStyle}>
        {/* status bar */}
        <div style={{ flex: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px 6px', fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}>
          <span>9:41</span>
          <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ width: 15, height: 8.5, border: '1px solid var(--tx)', borderRadius: 2.5, display: 'inline-block', position: 'relative' }}>
              <span style={{ position: 'absolute', inset: 1.5, left: '30%', background: 'var(--tx)', borderRadius: 1 }} />
            </span>
          </span>
        </div>

        {/* offline banner */}
        {s.offline && (
          <div style={{ flex: 'none', margin: '6px 16px 0', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--chip)', border: '1px dashed var(--bd)', borderRadius: 12, padding: '8px 12px', animation: 'fadeUp .25s both' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amb)', animation: 'recPulse 1.6s infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)' }}>{T('وضع عدم الاتصال — يُحفظ عملك محليًا وتتم المزامنة عند عودة الشبكة', 'Offline mode — your work is saved locally and syncs when the network returns')}</span>
          </div>
        )}

        {/* active screen */}
        <ErrorBoundary key={s.screen}>
          <Screen />
        </ErrorBoundary>

        {/* bottom nav */}
        {showNav && (
          <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', background: 'var(--card)', borderTop: '1px solid var(--bd)', padding: '9px 8px 18px' }}>
            <NavBtn active={s.screen === 'home'} onClick={() => root('home')} label={T('الرئيسية', 'Home')} icon={<path d="M3 11 12 4l9 7v8a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />} />
            <NavBtn active={s.screen === 'customers'} onClick={() => root('customers')} label={T('العملاء', 'Customers')} icon={<><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></>} />
            <span onClick={() => startReport(null)} style={{ cursor: 'pointer', width: 50, height: 50, borderRadius: 16, background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: -20, boxShadow: '0 8px 18px var(--sh)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </span>
            <NavBtn active={s.screen === 'careers'} onClick={() => root('careers')} label={T('الوظائف', 'Careers')} icon={<><circle cx="9" cy="9" r="3.5" /><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5" /><path d="M16.5 4.5a3.5 3.5 0 0 1 0 7M18.5 14.7c2 .9 3.2 2.6 3.2 5" /></>} />
            <NavBtn active={s.screen === 'me'} onClick={() => app.set({ screen: 'me', stack: ['home'] })} label={T('حسابي', 'Profile')} icon={<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>} />
          </div>
        )}

        {/* toast */}
        {s.toast && (
          <div style={{ position: 'absolute', top: 52, insetInlineStart: 20, insetInlineEnd: 20, zIndex: 60, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ background: 'var(--tx)', color: 'var(--bg)', fontSize: 12, fontWeight: 600, borderRadius: 12, padding: '10px 18px', boxShadow: '0 10px 26px rgba(0,0,0,.25)', animation: 'pop .32s cubic-bezier(.22,1,.36,1) both', maxWidth: 320, textAlign: 'center' }}>{t(s.toast)}</span>
          </div>
        )}

        {/* reject-reason sheet */}
        {s.rejectFor && <RejectSheet />}
      </div>

      <div style={{ font: "500 10px 'IBM Plex Mono', monospace", color: '#8B887F' }}>
        SALESBOOK · NEXT.JS · {dir.toUpperCase()} {lang.toUpperCase()}
      </div>
    </div>
  );
}

function RejectSheet() {
  const { s, data, set, rejectRequest, toast } = useApp();
  const { t, tt: T } = useI18n();
  const close = () => set({ rejectFor: null });
  const confirm = () => {
    if (!s.rejReason) { toast(tt('اختر سبب الرفض', 'Choose a rejection reason')); return; }
    if (s.rejectFor) rejectRequest(s.rejectFor);
  };
  return (
    <>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'var(--ov)', zIndex: 70, animation: 'fadeIn .2s both' }} />
      <div style={{ position: 'absolute', bottom: 0, insetInlineStart: 0, insetInlineEnd: 0, zIndex: 71, background: 'var(--card)', borderRadius: '24px 24px 0 0', padding: '10px 20px 26px', animation: 'slideUp .3s cubic-bezier(.22,1,.36,1) both' }}>
        <div style={{ width: 38, height: 4.5, borderRadius: 3, background: 'var(--dv)', margin: '4px auto 14px' }} />
        <div style={{ fontSize: 15.5, fontWeight: 700 }}>{T('سبب الرفض', 'Rejection reason')}</div>
        <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 3 }}>{T('سيُرسل السبب للمتقدم تلقائيًا مع إشعار الرفض', 'The reason is sent to the applicant automatically with the rejection notice')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {data.reasons.map((r, i) => {
            const label = t(r);
            const on = s.rejReason === label;
            return (
              <div key={i} onClick={() => set({ rejReason: label })} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, background: on ? 'var(--redT)' : 'var(--card)', border: `1.5px solid ${on ? 'var(--red)' : 'var(--bd)'}`, borderRadius: 13, padding: '12px 14px', transition: 'all .18s' }}>
                <span style={{ width: 19, height: 19, flex: 'none', borderRadius: '50%', border: `2px solid ${on ? 'var(--red)' : 'var(--bd)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: on ? 'var(--red)' : 'transparent' }} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{label}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
          <span onClick={confirm} style={{ cursor: 'pointer', flex: 1, height: 48, borderRadius: 13, background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 700 }}>{T('تأكيد الرفض', 'Confirm rejection')}</span>
          <span onClick={close} style={{ cursor: 'pointer', width: 110, height: 48, borderRadius: 13, background: 'var(--chip)', color: 'var(--tx)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 700 }}>{T('إلغاء', 'Cancel')}</span>
        </div>
      </div>
    </>
  );
}
