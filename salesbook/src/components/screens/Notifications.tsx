'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Icon } from '@/components/ui';
import { tone } from '@/lib/tokens';

export function Notifications() {
  const { s, data, back, nav, root, openC, markAllRead } = useApp();
  const { t, tt } = useI18n();
  const dot = s.notifRead ? 'transparent' : 'var(--org)';

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 4px' }}>
        <span onClick={back} style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}><Icon name="back" size={16} stroke="var(--tx)" sw={2} /></span>
        <div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 700 }}>{tt('التنبيهات', 'Notifications')}</div></div>
        <span onClick={markAllRead} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--lnk)' }}>{tt('قراءة الكل', 'Mark all read')}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, paddingBottom: 96 }}>
        {data.notifs.map((n, i) => {
          const tn = tone(n.tone);
          const go = () => {
            if (n.act === 'admin') nav('admin');
            else if (n.act === 'careers') root('careers');
            else if (n.act.startsWith('c:')) openC(n.act.slice(2));
          };
          return (
            <div key={i} onClick={go} style={{ cursor: 'pointer', display: 'flex', gap: 11, alignItems: 'flex-start', background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 15, padding: '13px 14px', transition: 'transform .15s' }}>
              <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 12, background: tn.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: tn.c }}>{n.sym}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ fontSize: 12.5, fontWeight: 700 }}>{t(n.tt)}</span><span style={{ width: 7, height: 7, flex: 'none', borderRadius: '50%', background: dot, marginInlineStart: 'auto' }} /></div>
                <div style={{ fontSize: 11.5, color: 'var(--sub)', lineHeight: 1.65, marginTop: 3 }}>{t(n.txt)}</div>
                <div style={{ fontSize: 10, color: 'var(--fnt)', marginTop: 4 }}>{t(n.when)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
