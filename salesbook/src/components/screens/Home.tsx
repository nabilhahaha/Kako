'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bell, Search, MapPin, Users, ClipboardCheck, UserPlus, ClipboardPlus,
  MessageCircle, CheckCircle2, Circle, ChevronLeft, ChevronRight, Sparkles,
  TrendingUp, ShieldAlert, Clock3,
} from 'lucide-react';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Avatar, ScoreRing } from '@/components/ui';

const card: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 20,
  boxShadow: 'var(--shadow-sm)',
};

function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 10px' }}>
      <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.2px' }}>{title}</span>
      {action && <button onClick={onAction} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: 'var(--lnk)', padding: 4 }}>{action}</button>}
    </div>
  );
}

function Kpi({ icon, value, label, tint, tintBg, onClick, i }: {
  icon: React.ReactNode; value: string | number; label: string; tint: string; tintBg: string; onClick?: () => void; i: number;
}) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      whileTap={{ scale: 0.97 }}
      style={{ ...card, cursor: onClick ? 'pointer' : 'default', textAlign: 'start', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <span style={{ width: 36, height: 36, borderRadius: 12, background: tintBg, color: tint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span>
        <span style={{ display: 'block', fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--tx)', lineHeight: 1.1 }}>{value}</span>
        <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--sub)', marginTop: 3 }}>{label}</span>
      </span>
    </motion.button>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ border: 'none', background: 'transparent', cursor: 'pointer', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: 0 }}>
      <span style={{ width: 52, height: 52, borderRadius: 18, background: 'var(--card)', border: '1px solid var(--bd)', boxShadow: 'var(--shadow-sm)', color: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}>{icon}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--sub)' }}>{label}</span>
    </button>
  );
}

/* Post-login landing: the rep's business dashboard. */
export function Home() {
  const { s, data, set, nav, openC, startReport } = useApp();
  const { t, tt, lang, dir } = useI18n();
  const unread = s.notifRead ? 0 : 4;

  // greeting + date resolve on the client to avoid SSR/client clock mismatch
  const [greet, setGreet] = useState(tt('مرحبًا', 'Welcome'));
  const [dateLine, setDateLine] = useState('');
  useEffect(() => {
    const h = new Date().getHours();
    setGreet(h < 12 ? tt('صباح الخير، أحمد', 'Good morning, Ahmed') : h < 17 ? tt('نهارك سعيد، أحمد', 'Good afternoon, Ahmed') : tt('مساء الخير، أحمد', 'Good evening, Ahmed'));
    try {
      setDateLine(new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()));
    } catch { /* ignore */ }
    // tt is stable per language; re-run when the language switches
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingReviews = useMemo(() => Object.values(s.reviews).filter((v) => v === 'pending').length, [s.reviews]);
  const pendingRequests = useMemo(() => Object.values(s.requests).filter((v) => v === 'pending').length, [s.requests]);
  const route = data.customers.slice(0, 3);

  const tasks = useMemo(() => ([
    { id: 'v1', t: tt(`زيارة ${data.customers[0]?.name.ar ?? ''}`, `Visit ${data.customers[0]?.name.en ?? ''}`) },
    { id: 'v2', t: tt(`تحديث بيانات ${data.customers[1]?.name.ar ?? ''}`, `Update ${data.customers[1]?.name.en ?? ''}`) },
    { id: 'v3', t: tt('اعتماد تحديثات الفريق المعلقة', 'Approve pending team updates') },
  ]), [data.customers, tt]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggleTask = (id: string) => setChecked((p) => ({ ...p, [id]: !p[id] }));

  const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 0' }}>
        <Avatar ini="أش" bg="var(--pri)" size={44} fontSize={14} onClick={() => set({ screen: 'me', stack: ['home'] })} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17.5, fontWeight: 700, letterSpacing: '-0.3px' }}>{greet}</div>
          <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 2 }}>{dateLine}{dateLine ? ' · ' : ''}{tt('٥ زيارات مجدولة اليوم', '5 visits scheduled today')}</div>
        </div>
        <button onClick={() => nav('notif')} aria-label={tt('التنبيهات', 'Notifications')} style={{ position: 'relative', width: 42, height: 42, flex: 'none', borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--tx)' }}>
          <Bell size={18} strokeWidth={1.9} aria-hidden />
          {unread > 0 && <span style={{ position: 'absolute', top: 7, insetInlineStart: 8, minWidth: 15, height: 15, background: 'var(--org)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--card)', padding: '0 2px' }}>{unread}</span>}
        </button>
      </div>

      {/* search */}
      <button onClick={() => set({ screen: 'search', stack: ['home'], query: '' })} style={{ margin: '16px 20px 0', width: 'calc(100% - 40px)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 16px', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
        <Search size={16} color="var(--fnt)" strokeWidth={2} aria-hidden />
        <span style={{ fontSize: 13, color: 'var(--fnt)' }}>{tt('ابحث — عملاء، جهات، أرقام، وظائف…', 'Search — customers, contacts, numbers, jobs…')}</span>
      </button>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 20px 0' }}>
        <Kpi i={0} icon={<MapPin size={18} strokeWidth={2} aria-hidden />} value={5} label={tt('زيارات اليوم', "Today's visits")} tint="var(--pri)" tintBg="var(--priT)" />
        <Kpi i={1} icon={<Users size={18} strokeWidth={2} aria-hidden />} value={data.customers.length} label={tt('عملاء نشطون', 'Active customers')} tint="var(--acc)" tintBg="var(--accT)" onClick={() => set({ screen: 'customers', stack: [] })} />
        <Kpi i={2} icon={<ClipboardCheck size={18} strokeWidth={2} aria-hidden />} value={pendingReviews} label={tt('مراجعات معلقة', 'Pending reviews')} tint="var(--amb)" tintBg="var(--ambT)" onClick={() => set({ screen: 'review', stack: ['home'] })} />
        <Kpi i={3} icon={<UserPlus size={18} strokeWidth={2} aria-hidden />} value={pendingRequests} label={tt('طلبات عضوية', 'Membership requests')} tint="var(--grn)" tintBg="var(--grnT)" onClick={() => set({ screen: 'admin', stack: ['home'] })} />
      </div>

      {/* quick actions */}
      <div style={{ display: 'flex', gap: 10, padding: '18px 20px 0' }}>
        <QuickAction icon={<ClipboardPlus size={20} strokeWidth={1.9} aria-hidden />} label={tt('تقرير جديد', 'New report')} onClick={() => startReport(null)} />
        <QuickAction icon={<Search size={20} strokeWidth={1.9} aria-hidden />} label={tt('بحث', 'Search')} onClick={() => set({ screen: 'search', stack: ['home'], query: '' })} />
        <QuickAction icon={<Users size={20} strokeWidth={1.9} aria-hidden />} label={tt('العملاء', 'Customers')} onClick={() => set({ screen: 'customers', stack: [] })} />
        <QuickAction icon={<MessageCircle size={20} strokeWidth={1.9} aria-hidden />} label={tt('الرسائل', 'Messages')} onClick={() => set({ screen: 'messages', stack: ['home'] })} />
      </div>

      {/* AI insights */}
      <SectionHead title={tt('رؤى ذكية', 'AI insights')} />
      <div style={{ margin: '0 20px', borderRadius: 20, padding: 1.5, background: 'linear-gradient(135deg, var(--pri), var(--acc))' }}>
        <div style={{ background: 'var(--card)', borderRadius: 18.5, overflow: 'hidden' }}>
          {[
            {
              icon: <ShieldAlert size={16} aria-hidden />, c: 'var(--amb)', b: 'var(--ambT)',
              t: tt(`${data.customers.filter((x) => x.score < 65).length} عملاء بدرجة ثقة منخفضة — بياناتهم تحتاج تحققًا ميدانيًا`, `${data.customers.filter((x) => x.score < 65).length} customers have low trust scores — their data needs field verification`),
              go: () => set({ screen: 'customers', stack: [] }),
            },
            {
              icon: <Clock3 size={16} aria-hidden />, c: 'var(--pri)', b: 'var(--priT)',
              t: tt('أفضل نافذة لزيارات اليوم 9–11 صباحًا بحسب سجل استجابة عملائك', 'Best visit window today is 9–11 AM based on your customers’ response history'),
              go: () => set({ screen: 'customers', stack: [] }),
            },
            {
              icon: <TrendingUp size={16} aria-hidden />, c: 'var(--grn)', b: 'var(--grnT)',
              t: tt(`اعتماد ${pendingReviews} تحديثات معلقة سيرفع دقة درجات عملائك هذا الأسبوع`, `Approving ${pendingReviews} pending updates will sharpen your customer scores this week`),
              go: () => set({ screen: 'review', stack: ['home'] }),
            },
          ].map((ins, i) => (
            <button key={i} onClick={ins.go} style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--dv)', textAlign: 'start' }}>
              <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 10, background: ins.b, color: ins.c, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ins.icon}</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--tx)', lineHeight: 1.6 }}>{ins.t}</span>
              {i === 0 && <Sparkles size={14} color="var(--pri)" style={{ flex: 'none' }} aria-hidden />}
            </button>
          ))}
        </div>
      </div>

      {/* today's route */}
      <SectionHead title={tt('خط سير اليوم', "Today's route")} action={tt('كل العملاء', 'All customers')} onAction={() => set({ screen: 'customers', stack: [] })} />
      <div style={{ ...card, margin: '0 20px', overflow: 'hidden' }}>
        {route.map((x, i) => (
          <button key={x.id} onClick={() => openC(x.id)} style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--dv)', textAlign: 'start' }}>
            <ScoreRing score={x.score} size={42} inner={33} fontSize={12} pop={false} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(x.name)}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{t(x.updWhen)}</span>
            </span>
            <Chevron size={17} color="var(--fnt)" strokeWidth={2} aria-hidden />
          </button>
        ))}
      </div>

      {/* tasks */}
      <SectionHead title={tt('مهام اليوم', "Today's tasks")} />
      <div style={{ ...card, margin: '0 20px', overflow: 'hidden' }}>
        {tasks.map((task, i) => {
          const on = !!checked[task.id];
          return (
            <button key={task.id} onClick={() => toggleTask(task.id)} role="checkbox" aria-checked={on} style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--dv)', textAlign: 'start' }}>
              {on
                ? <CheckCircle2 size={20} color="var(--grn)" strokeWidth={2} aria-hidden />
                : <Circle size={20} color="var(--fnt)" strokeWidth={1.8} aria-hidden />}
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: on ? 'var(--fnt)' : 'var(--tx)', textDecoration: on ? 'line-through' : 'none', transition: 'color .2s' }}>{task.t}</span>
            </button>
          );
        })}
      </div>

      {/* recent activity */}
      <SectionHead title={tt('آخر النشاط', 'Recent activity')} action={tt('المنصة', 'Open feed')} onAction={() => set({ screen: 'feed', stack: [] })} />
      <div style={{ ...card, margin: '0 20px 24px', overflow: 'hidden' }}>
        {data.posts.slice(0, 3).map((p, i) => (
          <button key={p.id} onClick={() => openC(p.cid)} style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--dv)', textAlign: 'start' }}>
            <Avatar ini={p.ini} bg={p.av} size={36} fontSize={12} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ fontWeight: 700 }}>{t(p.by)}</span> <span style={{ color: 'var(--sub)' }}>{t(p.act)}</span> <span style={{ fontWeight: 700, color: 'var(--lnk)' }}>{t(p.cust)}</span>
              </span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--fnt)', marginTop: 2 }}>{t(p.when)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
