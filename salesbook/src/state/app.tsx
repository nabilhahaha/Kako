'use client';
import {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, ReactNode,
} from 'react';
import type { Bootstrap, ChatMsg, L, Theme, ApprovalStatus } from '@/lib/types';
import { bootstrap as seedBootstrap } from '@/lib/seed';

export type ConnState = 'pending' | 'accepted' | 'declined';

export interface AppState {
  screen: string;
  stack: string[];
  theme: Theme;
  loading: boolean;
  offline: boolean;
  filter: string;
  sort: 'new' | 'near';
  query: string;
  selId: string;
  tab: string;
  reportStep: number;
  repCust: string | null;
  repOverall: number;
  repPay: string | null;
  repMove: string | null;
  repVoice: boolean;
  repPhotos: number;
  feedFilter: string;
  likes: Record<string, boolean>;
  availOn: boolean;
  applied: Record<string, boolean>;
  careersTab: 'jobs' | 'tal';
  connReqs: Record<string, ConnState>;
  conns: Record<string, boolean>;
  chatId: string;
  chatInput: string;
  typing: boolean;
  chatMsgs: ChatMsg[] | null;
  rsvp: Record<string, boolean>;
  joined: Record<string, boolean>;
  notifRead: boolean;
  requests: Record<string, ApprovalStatus>;
  rejectFor: string | null;
  rejReason: string | null;
  reviews: Record<string, ApprovalStatus>;
  toast: L | null;
  ntf1: boolean;
  ntf2: boolean;
}

function initialState(data: Bootstrap, theme: Theme): AppState {
  const requests: Record<string, ApprovalStatus> = {};
  data.requests.forEach((r) => (requests[r.id] = 'pending'));
  const reviews: Record<string, ApprovalStatus> = {};
  data.reviews.forEach((v) => (reviews[v.id] = 'pending'));
  return {
    screen: 'login', stack: [], theme, loading: false, offline: false,
    filter: 'all', sort: 'new', query: '', selId: 'n1', tab: 'ov',
    reportStep: 0, repCust: null, repOverall: 0, repPay: null, repMove: null, repVoice: false, repPhotos: 0,
    feedFilter: 'all', likes: {}, availOn: false, applied: {}, careersTab: 'jobs',
    connReqs: { q1: 'pending', q2: 'pending' }, conns: {}, chatId: 't1', chatInput: '', typing: false, chatMsgs: null,
    rsvp: {}, joined: {}, notifRead: false, requests, rejectFor: null, rejReason: null, reviews,
    toast: null, ntf1: true, ntf2: false,
  };
}

export interface AppCtx {
  s: AppState;
  data: Bootstrap;
  set: (p: Partial<AppState>) => void;
  update: (fn: (p: AppState) => Partial<AppState>) => void;
  nav: (screen: string, extra?: Partial<AppState>) => void;
  root: (screen: string) => void;
  back: () => void;
  openC: (id: string) => void;
  openChat: (id: string) => void;
  toast: (m: L) => void;
  login: () => void;
  startReport: (preId: string | null) => void;
  repNext: () => void;
  repBack: () => void;
  sendMsg: () => void;
  toggleTheme: () => void;
  approveRequest: (id: string) => void;
  rejectRequest: (id: string) => void;
  approveReview: (id: string) => void;
  rejectReview: (id: string) => void;
  markAllRead: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

const tt = (ar: string, en: string): L => ({ ar, en });

export function AppProvider({ theme = 'light', children }: { theme?: Theme; children: ReactNode }) {
  const [data] = useState<Bootstrap>(() => seedBootstrap());
  const [s, setS] = useState<AppState>(() => initialState(data, theme));
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const set = useCallback((p: Partial<AppState>) => setS((prev) => ({ ...prev, ...p })), []);
  const update = useCallback((fn: (p: AppState) => Partial<AppState>) => setS((prev) => ({ ...prev, ...fn(prev) })), []);

  // ---- refresh persistence: restore nav + theme from the last session ----
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('sb_nav');
      if (saved) setS((p) => ({ ...p, ...(JSON.parse(saved) as Partial<AppState>) }));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem('sb_nav', JSON.stringify({
        screen: s.screen, stack: s.stack, selId: s.selId, tab: s.tab, chatId: s.chatId, theme: s.theme,
      }));
    } catch { /* ignore */ }
  }, [s.screen, s.stack, s.selId, s.tab, s.chatId, s.theme]);

  // ---- browser Back/Forward → in-app back (keeps the SPA on screen) ----
  const stackLen = useRef(0);
  useEffect(() => {
    window.history.replaceState({ sb: true }, '');
    const onPop = () => {
      setS((prev) => {
        window.history.pushState({ sb: true }, ''); // re-anchor so we never leave the app
        if (prev.stack.length === 0) return prev;
        const st = prev.stack.slice();
        const screen = st.pop() || 'home';
        return { ...prev, stack: st, screen };
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (s.stack.length > stackLen.current) window.history.pushState({ sb: true }, '');
    stackLen.current = s.stack.length;
  }, [s.stack.length]);

  // hydrate persisted workflow state from the backend
  useEffect(() => {
    let alive = true;
    fetch('/api/bootstrap')
      .then((r) => r.json())
      .then((b) => {
        if (!alive || !b?.state) return;
        setS((prev) => ({
          ...prev,
          requests: { ...prev.requests, ...b.state.requests },
          reviews: { ...prev.reviews, ...b.state.reviews },
          notifRead: b.state.notifRead ?? prev.notifRead,
        }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const toast = useCallback((m: L) => {
    clearTimeout(timers.current.toast);
    setS((p) => ({ ...p, toast: m }));
    timers.current.toast = setTimeout(() => setS((p) => ({ ...p, toast: null })), 2200);
  }, []);

  const nav = useCallback((screen: string, extra?: Partial<AppState>) => {
    setS((p) => ({ ...p, stack: p.stack.concat([p.screen]), screen, ...(extra || {}) }));
  }, []);
  const root = useCallback((screen: string) => setS((p) => ({ ...p, screen, stack: [] })), []);
  const back = useCallback(() => setS((p) => {
    const st = p.stack.slice();
    const screen = st.pop() || 'home';
    return { ...p, stack: st, screen };
  }), []);
  const openC = useCallback((id: string) => nav('customer', { selId: id, tab: 'ov' }), [nav]);
  const openChat = useCallback((id: string) => nav('chat', { chatId: id }), [nav]);

  const login = useCallback(() => {
    setS((p) => ({ ...p, screen: 'home', stack: [], loading: true }));
    fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
    clearTimeout(timers.current.login);
    timers.current.login = setTimeout(() => setS((p) => ({ ...p, loading: false })), 800);
  }, []);

  const startReport = useCallback((preId: string | null) => {
    nav('report', { repCust: preId || null, reportStep: preId ? 2 : 1, repOverall: 0, repPay: null, repMove: null, repVoice: false });
  }, [nav]);

  const repNext = useCallback(() => setS((p) => {
    if (p.reportStep === 1 && !p.repCust) { toast(tt('اختر عميلًا أولًا', 'Choose a customer first')); return p; }
    if (p.reportStep === 2 && !p.repPay) { toast(tt('اختر تقييم الدفع', 'Choose a payment rating')); return p; }
    if (p.reportStep === 3 && !p.repMove) { toast(tt('اختر سرعة حركة المنتجات', 'Choose the product movement speed')); return p; }
    if (p.reportStep >= 7) return { ...p, reportStep: 8 };
    return { ...p, reportStep: p.reportStep + 1 };
  }), [toast]);

  const repBack = useCallback(() => setS((p) => {
    const step = p.reportStep;
    if (step <= 1 || (step === 2 && p.stack[p.stack.length - 1] === 'customer' && p.repCust)) {
      const st = p.stack.slice();
      const screen = st.pop() || 'home';
      return { ...p, stack: st, screen };
    }
    return { ...p, reportStep: step - 1 };
  }), []);

  const sendMsg = useCallback(() => {
    const text = (s.chatInput || '').trim();
    if (!text) { toast(tt('اكتب رسالة أولًا', 'Type a message first')); return; }
    const outgoing: ChatMsg = { me: true, t: tt(text, text), when: tt('الآن', 'now'), read: false };
    setS((p) => ({ ...p, chatMsgs: (p.chatMsgs || data.chatseed).concat([outgoing]), chatInput: '' }));
    fetch(`/api/messages/${s.chatId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => {});
    clearTimeout(timers.current.ty1); clearTimeout(timers.current.ty2);
    timers.current.ty1 = setTimeout(() => setS((p) => ({ ...p, typing: true })), 800);
    timers.current.ty2 = setTimeout(() => setS((p) => ({
      ...p, typing: false,
      chatMsgs: (p.chatMsgs || data.chatseed).concat([{ me: false, t: tt('تمام — أمرّ عليه بكرة الصباح وأحدّث الملف بعد الزيارة مباشرة.', 'Great — I’ll drop by tomorrow morning and update the profile right after the visit.'), when: tt('الآن', 'now') }]),
    })), 2600);
  }, [s.chatInput, s.chatId, data.chatseed, toast]);

  const toggleTheme = useCallback(() => setS((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' })), []);

  const approveRequest = useCallback((id: string) => {
    setS((p) => ({ ...p, requests: { ...p.requests, [id]: 'approved' } }));
    toast(tt('تم اعتماد العضوية — أُرسل إشعار للمتقدم', 'Membership approved — the applicant was notified'));
    fetch(`/api/requests/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) }).catch(() => {});
  }, [toast]);

  const rejectRequest = useCallback((id: string) => {
    setS((p) => ({ ...p, requests: { ...p.requests, [id]: 'rejected' }, rejectFor: null }));
    toast(tt('تم الرفض وإرسال السبب للمتقدم تلقائيًا', 'Rejected — the reason was sent to the applicant automatically'));
    fetch(`/api/requests/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reject', reason: s.rejReason }) }).catch(() => {});
  }, [toast, s.rejReason]);

  const approveReview = useCallback((id: string) => {
    setS((p) => ({ ...p, reviews: { ...p.reviews, [id]: 'approved' } }));
    toast(tt('اعتُمد التحديث وأصبح مرئيًا للجميع', 'Update approved — now visible to everyone'));
    fetch(`/api/reviews/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) }).catch(() => {});
  }, [toast]);

  const rejectReview = useCallback((id: string) => {
    setS((p) => ({ ...p, reviews: { ...p.reviews, [id]: 'rejected' } }));
    toast(tt('رُفض التحديث وأُبلغ المندوب بالسبب', 'Update rejected — the rep was notified of the reason'));
    fetch(`/api/reviews/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reject' }) }).catch(() => {});
  }, [toast]);

  const markAllRead = useCallback(() => {
    setS((p) => ({ ...p, notifRead: true }));
    toast(tt('تمت قراءة جميع التنبيهات', 'All notifications marked read'));
    fetch('/api/notifications/read', { method: 'POST' }).catch(() => {});
  }, [toast]);

  const value = useMemo<AppCtx>(() => ({
    s, data, set, update, nav, root, back, openC, openChat, toast, login, startReport,
    repNext, repBack, sendMsg, toggleTheme, approveRequest, rejectRequest, approveReview, rejectReview, markAllRead,
  }), [s, data, set, update, nav, root, back, openC, openChat, toast, login, startReport, repNext, repBack, sendMsg, toggleTheme, approveRequest, rejectRequest, approveReview, rejectReview, markAllRead]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be used within AppProvider');
  return c;
}
