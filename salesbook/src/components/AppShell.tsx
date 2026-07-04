'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, Users, Newspaper, MessageCircle, CircleUser, Download, X } from 'lucide-react';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { SCREENS } from './screens';
import { ErrorBoundary } from './ErrorBoundary';

const NAV_SCREENS = ['home', 'customers', 'feed', 'messages', 'me'];

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/* Registers the offline service worker once, in production only. */
function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
}

/* Captures the browser install prompt so we can offer "Add to Home Screen". */
function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try { setDismissed(localStorage.getItem('sb_pwa_dismissed') === '1'); } catch { /* ignore */ }
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    setDeferred(null);
  };
  const dismiss = () => {
    setDeferred(null);
    setDismissed(true);
    try { localStorage.setItem('sb_pwa_dismissed', '1'); } catch { /* ignore */ }
  };
  return { available: !!deferred && !dismissed, install, dismiss };
}

function NavTab({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      style={{
        position: 'relative', flex: 1, minWidth: 0, height: 56, border: 'none', background: 'transparent',
        cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 4, padding: 0, color: active ? 'var(--pri)' : 'var(--fnt)',
        WebkitTapHighlightColor: 'transparent', transition: 'color .2s',
      }}>
      {active && (
        <motion.span
          layoutId="nav-pill"
          transition={{ type: 'spring', stiffness: 480, damping: 38 }}
          style={{
            position: 'absolute', top: 4, width: 48, height: 30, borderRadius: 15,
            background: 'var(--priT)', zIndex: 0,
          }}
        />
      )}
      <span style={{ position: 'relative', zIndex: 1, display: 'flex', height: 22, alignItems: 'center' }}>{icon}</span>
      <span style={{ position: 'relative', zIndex: 1, fontSize: 10.5, fontWeight: active ? 700 : 500, lineHeight: 1 }}>{label}</span>
    </button>
  );
}

export function AppShell() {
  const app = useApp();
  const { s, root, set } = app;
  const { t, tt: T, dir, lang } = useI18n();
  const Screen = SCREENS[s.screen] || SCREENS.login;
  const showNav = NAV_SCREENS.includes(s.screen);
  const authScreen = s.screen === 'login' || s.screen === 'register' || s.screen === 'pending';

  useServiceWorker();
  const pwa = useInstallPrompt();
  const reduceMotionRef = useRef(false);
  useEffect(() => {
    reduceMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  return (
    <div
      data-slk="true"
      data-th={s.theme}
      dir={dir}
      lang={lang}
      style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--bg)', color: 'var(--tx)', transition: 'background .3s',
        paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)',
      }}>
      {/* app column — full width on phones, centered on tablet/desktop */}
      <div style={{
        flex: 1, minHeight: 0, width: '100%', maxWidth: 640, margin: '0 auto',
        display: 'flex', flexDirection: 'column', position: 'relative',
      }}>
        {/* status-bar spacer (notch / dynamic island) */}
        <div style={{ flex: 'none', height: 'var(--safe-top)' }} />

        {/* offline banner */}
        {s.offline && (
          <div role="status" style={{ flex: 'none', margin: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--chip)', border: '1px dashed var(--bd)', borderRadius: 14, padding: '8px 12px', animation: 'fadeUp .25s both' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amb)', animation: 'recPulse 1.6s infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)' }}>{T('وضع عدم الاتصال — يُحفظ عملك محليًا وتتم المزامنة عند عودة الشبكة', 'Offline mode — your work is saved locally and syncs when the network returns')}</span>
          </div>
        )}

        {/* active screen with page transition */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={s.screen}
              initial={reduceMotionRef.current ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotionRef.current ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <ErrorBoundary key={s.screen}>
                <Screen />
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* install prompt (after login, when the browser offers it) */}
        {pwa.available && !authScreen && (
          <div style={{ flex: 'none', margin: '0 16px 10px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '10px 14px', boxShadow: 'var(--shadow-md)', animation: 'fadeUp .3s both' }}>
            <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 12, background: 'var(--priT)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Download size={18} color="var(--pri)" strokeWidth={2} aria-hidden />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{T('ثبّت SalesBook', 'Install SalesBook')}</div>
              <div style={{ fontSize: 11, color: 'var(--sub)' }}>{T('تجربة تطبيق كاملة من الشاشة الرئيسية', 'Full app experience from your home screen')}</div>
            </div>
            <button onClick={pwa.install} style={{ border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--onPri)', background: 'var(--pri)', borderRadius: 10, padding: '9px 14px' }}>{T('تثبيت', 'Install')}</button>
            <button onClick={pwa.dismiss} aria-label={T('إغلاق', 'Dismiss')} style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--fnt)', display: 'flex', padding: 4 }}>
              <X size={16} aria-hidden />
            </button>
          </div>
        )}

        {/* bottom navigation */}
        {showNav && (
          <nav aria-label={T('التنقل الرئيسي', 'Main navigation')} style={{
            flex: 'none', display: 'flex', alignItems: 'stretch',
            background: 'var(--card)', borderTop: '1px solid var(--bd)',
            padding: '6px 8px calc(8px + var(--safe-bottom))',
          }}>
            <NavTab active={s.screen === 'home'} onClick={() => root('home')} label={T('الرئيسية', 'Home')} icon={<Home size={21} strokeWidth={s.screen === 'home' ? 2.2 : 1.8} aria-hidden />} />
            <NavTab active={s.screen === 'customers'} onClick={() => root('customers')} label={T('العملاء', 'Customers')} icon={<Users size={21} strokeWidth={s.screen === 'customers' ? 2.2 : 1.8} aria-hidden />} />
            <NavTab active={s.screen === 'feed'} onClick={() => root('feed')} label={T('المنصة', 'Feed')} icon={<Newspaper size={21} strokeWidth={s.screen === 'feed' ? 2.2 : 1.8} aria-hidden />} />
            <NavTab active={s.screen === 'messages'} onClick={() => root('messages')} label={T('الرسائل', 'Messages')} icon={<MessageCircle size={21} strokeWidth={s.screen === 'messages' ? 2.2 : 1.8} aria-hidden />} />
            <NavTab active={s.screen === 'me'} onClick={() => set({ screen: 'me', stack: ['home'] })} label={T('حسابي', 'Profile')} icon={<CircleUser size={21} strokeWidth={s.screen === 'me' ? 2.2 : 1.8} aria-hidden />} />
          </nav>
        )}
        {/* bottom safe-area filler when nav is hidden */}
        {!showNav && <div style={{ flex: 'none', height: 'var(--safe-bottom)' }} />}

        {/* toast */}
        {s.toast && (
          <div style={{ position: 'absolute', top: 'calc(14px + var(--safe-top))', insetInlineStart: 20, insetInlineEnd: 20, zIndex: 60, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <span role="status" style={{ background: 'var(--tx)', color: 'var(--bg)', fontSize: 12.5, fontWeight: 600, borderRadius: 14, padding: '11px 18px', boxShadow: 'var(--shadow-lg)', animation: 'pop .32s cubic-bezier(.22,1,.36,1) both', maxWidth: 340, textAlign: 'center' }}>{t(s.toast)}</span>
          </div>
        )}

        {/* reject-reason sheet */}
        {s.rejectFor && <RejectSheet />}
      </div>
    </div>
  );
}

function RejectSheet() {
  const { s, data, set, rejectRequest, toast } = useApp();
  const { t, tt: T } = useI18n();
  const close = () => set({ rejectFor: null });
  const confirm = () => {
    if (!s.rejReason) { toast({ ar: 'اختر سبب الرفض', en: 'Choose a rejection reason' }); return; }
    if (s.rejectFor) rejectRequest(s.rejectFor);
  };
  return (
    <>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'var(--ov)', zIndex: 70, animation: 'fadeIn .2s both' }} />
      <div role="dialog" aria-modal="true" aria-label={T('سبب الرفض', 'Rejection reason')} style={{ position: 'absolute', bottom: 0, insetInlineStart: 0, insetInlineEnd: 0, zIndex: 71, background: 'var(--card)', borderRadius: '24px 24px 0 0', padding: '10px 20px calc(26px + var(--safe-bottom))', animation: 'slideUp .3s cubic-bezier(.22,1,.36,1) both', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ width: 38, height: 4.5, borderRadius: 3, background: 'var(--dv)', margin: '4px auto 14px' }} />
        <div style={{ fontSize: 15.5, fontWeight: 700 }}>{T('سبب الرفض', 'Rejection reason')}</div>
        <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 3 }}>{T('سيُرسل السبب للمتقدم تلقائيًا مع إشعار الرفض', 'The reason is sent to the applicant automatically with the rejection notice')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {data.reasons.map((r, i) => {
            const label = t(r);
            const on = s.rejReason === label;
            return (
              <div key={i} onClick={() => set({ rejReason: label })} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, background: on ? 'var(--redT)' : 'var(--card)', border: `1.5px solid ${on ? 'var(--red)' : 'var(--bd)'}`, borderRadius: 14, padding: '12px 14px', transition: 'all .18s' }}>
                <span style={{ width: 19, height: 19, flex: 'none', borderRadius: '50%', border: `2px solid ${on ? 'var(--red)' : 'var(--bd)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: on ? 'var(--red)' : 'transparent' }} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{label}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
          <button onClick={confirm} style={{ border: 'none', cursor: 'pointer', flex: 1, height: 48, borderRadius: 14, background: 'var(--red)', color: '#fff', fontSize: 13.5, fontWeight: 700 }}>{T('تأكيد الرفض', 'Confirm rejection')}</button>
          <button onClick={close} style={{ border: 'none', cursor: 'pointer', width: 110, height: 48, borderRadius: 14, background: 'var(--chip)', color: 'var(--tx)', fontSize: 13.5, fontWeight: 700 }}>{T('إلغاء', 'Cancel')}</button>
        </div>
      </div>
    </>
  );
}
