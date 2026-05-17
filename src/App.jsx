import {
  useEffect,
  useState,
  useCallback,
  createContext,
  useContext,
} from 'react';
import { t, getLang, setLang as persistLang } from './lib/lang.js';
import { supabase } from './lib/supabase.js';
import { db } from './lib/db.js';
import LoginPage from './pages/LoginPage.jsx';
import SalesmanPage from './pages/SalesmanPage.jsx';
import TradeMarketingPage from './pages/TradeMarketingPage.jsx';
import RoshenManagerPage from './pages/RoshenManagerPage.jsx';

const LangContext = createContext({ lang: 'ar', tr: t.ar, setLang: () => {} });
export const useLang = () => useContext(LangContext);

const ToastContext = createContext({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

const AuthContext = createContext({ user: null, profile: null, signOut: () => {} });
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [lang, setLangState] = useState(getLang());
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  /* ─── Language ─── */
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((newLang) => {
    persistLang(newLang);
    setLangState(newLang);
  }, []);

  /* ─── Auth bootstrap ─── */
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setAuthReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /* ─── Fetch profile when session changes ─── */
  useEffect(() => {
    let active = true;
    setProfileError(null);

    if (!session?.user) {
      setProfile(null);
      return;
    }

    (async () => {
      try {
        const p = await db.getProfile(session.user.id);
        if (!active) return;
        if (!p) {
          setProfileError('no_profile');
          setProfile(null);
        } else if (!p.is_active) {
          setProfileError('inactive');
          setProfile(null);
        } else {
          setProfile(p);
        }
      } catch (e) {
        console.error(e);
        if (active) setProfileError(e.message || 'error');
      }
    })();

    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  /* ─── Toast ─── */
  const toast = useCallback((message, variant = 'default') => {
    setToastMsg({ message, variant, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const id = setTimeout(() => setToastMsg(null), 2800);
    return () => clearTimeout(id);
  }, [toastMsg]);

  const tr = t[lang];

  /* ─── Routing ─── */
  let page;
  if (!authReady) {
    page = <FullScreenLoader />;
  } else if (!session) {
    page = <LoginPage />;
  } else if (profileError === 'no_profile') {
    page = <AccountError message={tr.noProfile} onSignOut={signOut} />;
  } else if (profileError === 'inactive') {
    page = <AccountError message={tr.inactiveAccount} onSignOut={signOut} />;
  } else if (!profile) {
    page = <FullScreenLoader />;
  } else if (profile.role === 'salesman') {
    page = <SalesmanPage />;
  } else if (profile.role === 'trade_marketing') {
    page = <TradeMarketingPage />;
  } else if (profile.role === 'roshen_manager') {
    page = <RoshenManagerPage />;
  } else {
    page = <AccountError message="Unknown role" onSignOut={signOut} />;
  }

  return (
    <LangContext.Provider value={{ lang, tr, setLang }}>
      <AuthContext.Provider value={{ user: session?.user || null, profile, signOut }}>
        <ToastContext.Provider value={{ toast }}>
          <div className="app-shell">{page}</div>
          {toastMsg && (
            <div className={`toast ${toastMsg.variant}`} key={toastMsg.id}>
              {toastMsg.message}
            </div>
          )}
        </ToastContext.Provider>
      </AuthContext.Provider>
    </LangContext.Provider>
  );
}

function FullScreenLoader() {
  return (
    <div className="flex-1 flex items-center justify-center text-gray-400">
      <div className="text-center">
        <div className="text-4xl mb-2 animate-pulse">🏷️</div>
        <p className="text-sm">…</p>
      </div>
    </div>
  );
}

function AccountError({ message, onSignOut }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="card p-6 text-center max-w-sm fade-in">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-sm text-gray-700 mb-4">{message}</p>
        <button onClick={onSignOut} className="btn-primary w-full">
          OK
        </button>
      </div>
    </div>
  );
}
