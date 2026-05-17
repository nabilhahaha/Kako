import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { t, getLang, setLang as persistLang } from './lib/lang.js';
import LoginPage from './pages/LoginPage.jsx';
import SalesmanPage from './pages/SalesmanPage.jsx';
import TradeMarketingPage from './pages/TradeMarketingPage.jsx';
import RoshenManagerPage from './pages/RoshenManagerPage.jsx';

const LangContext = createContext({ lang: 'ar', tr: t.ar, setLang: () => {} });
export const useLang = () => useContext(LangContext);

const ToastContext = createContext({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

const SESSION_KEY = 'nex_session';

const readSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeSession = (s) => {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
};

export default function App() {
  const [lang, setLangState] = useState(getLang());
  const [session, setSession] = useState(readSession());
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((newLang) => {
    persistLang(newLang);
    setLangState(newLang);
  }, []);

  const login = useCallback((role, salesmanName) => {
    const s = { role, salesmanName: salesmanName || null, loggedInAt: Date.now() };
    writeSession(s);
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    writeSession(null);
    setSession(null);
  }, []);

  const toast = useCallback((message, variant = 'default') => {
    setToastMsg({ message, variant, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const id = setTimeout(() => setToastMsg(null), 2800);
    return () => clearTimeout(id);
  }, [toastMsg]);

  const tr = t[lang];

  let page;
  if (!session) {
    page = <LoginPage onLogin={login} />;
  } else if (session.role === 'salesman') {
    page = <SalesmanPage session={session} onLogout={logout} />;
  } else if (session.role === 'trade_marketing') {
    page = <TradeMarketingPage onLogout={logout} />;
  } else if (session.role === 'roshen_manager') {
    page = <RoshenManagerPage onLogout={logout} />;
  } else {
    page = <LoginPage onLogin={login} />;
  }

  return (
    <LangContext.Provider value={{ lang, tr, setLang }}>
      <ToastContext.Provider value={{ toast }}>
        <div className="app-shell">{page}</div>
        {toastMsg && (
          <div className={`toast ${toastMsg.variant}`} key={toastMsg.id}>
            {toastMsg.message}
          </div>
        )}
      </ToastContext.Provider>
    </LangContext.Provider>
  );
}
