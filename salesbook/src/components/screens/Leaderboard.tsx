'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import type { Leader } from '@/lib/types';

function medal(r: string): { bg: string; c: string } {
  if (r === '1') return { bg: 'var(--ambT)', c: 'var(--ambTx)' };
  if (r === '2') return { bg: 'var(--chip)', c: 'var(--sub)' };
  if (r === '3') return { bg: 'var(--orgT)', c: 'var(--orgTx)' };
  return { bg: 'transparent', c: 'var(--fnt)' };
}

function LeaderRow({ l }: { l: Leader }) {
  const { t, tt } = useI18n();
  const m = medal(l.r);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: l.me ? 'var(--priT)' : 'var(--card)', border: `1.5px solid ${l.me ? 'var(--pri)' : 'var(--bd)'}`, borderRadius: 15, padding: '12px 14px' }}>
      <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 10, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: m.c }}>{l.r}</span>
      <div style={{ width: 40, height: 40, flex: 'none', borderRadius: '50%', background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--lnk)' }}>{l.ini}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{t(l.n)}</div>
        <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 1 }}>{t(l.sub)}</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--grnTx)' }}>{l.pts}</div>
        <div style={{ fontSize: 8.5, color: 'var(--fnt)' }}>{tt('نقطة', 'points')}</div>
      </div>
    </div>
  );
}

export function Leaderboard() {
  const { data, back } = useApp();
  const { tt } = useI18n();
  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
        <span onClick={back} style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{tt('لوحة المتصدرين', 'Leaderboard')}</div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 1 }}>{tt('الأكثر مساهمة موثقة — يوليو', 'Top verified contributors — July')}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, paddingBottom: 30 }}>
        {data.leaders.map((l, i) => <LeaderRow key={i} l={l} />)}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--priT)', borderRadius: 12, padding: '10px 13px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></svg>
          <span style={{ fontSize: 11, color: 'var(--lnk)', lineHeight: 1.6 }}>{tt('النقاط تُحتسب من التقارير المعتمدة والتوثيقات والمساهمات المفيدة فقط', 'Points are earned only from approved reports, verifications & helpful contributions')}</span>
        </div>
      </div>
    </div>
  );
}
