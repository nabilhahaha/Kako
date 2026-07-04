'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Icon } from '@/components/ui';
import type { ConnReq, Suggest } from '@/lib/types';

function ConnReqCard({ r }: { r: ConnReq }) {
  const { s, update, toast } = useApp();
  const { t, tt } = useI18n();
  const st = s.connReqs[r.id];
  const accept = () => {
    update((p) => ({ connReqs: { ...p.connReqs, [r.id]: 'accepted' } }));
    toast({ ar: 'أصبح ' + r.n.ar + ' ضمن شبكتك', en: r.n.en + ' is now in your network' });
  };
  const decline = () => update((p) => ({ connReqs: { ...p.connReqs, [r.id]: 'declined' } }));
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 15, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 42, height: 42, flex: 'none', borderRadius: '50%', background: r.av, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{r.ini}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t(r.n)}</div>
          <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 1 }}>{t(r.sub)}</div>
          <div style={{ fontSize: 9.5, color: 'var(--fnt)', marginTop: 2 }}>{t(r.mut)}</div>
        </div>
      </div>
      {st === 'pending' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <span onClick={accept} style={{ cursor: 'pointer', flex: 1, height: 38, borderRadius: 11, background: 'var(--pri)', color: 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'transform .15s' }}>{tt('قبول', 'Accept')}</span>
          <span onClick={decline} style={{ cursor: 'pointer', flex: 1, height: 38, borderRadius: 11, background: 'var(--chip)', color: 'var(--sub)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'transform .15s' }}>{tt('تجاهل', 'Ignore')}</span>
        </div>
      )}
      {st === 'accepted' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, background: 'var(--grnT)', borderRadius: 10, padding: '9px 12px', animation: 'fadeUp .3s both' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--grnTx)' }}>{tt('✓ أصبحتما متصلين — ابدأ محادثة', '✓ You’re now connected — start a conversation')}</span>
        </div>
      )}
      {st === 'declined' && (
        <div style={{ fontSize: 10.5, color: 'var(--fnt)', marginTop: 10 }}>{tt('تم التجاهل بهدوء — لن يُشعر المرسل', 'Quietly ignored — the sender won’t be notified')}</div>
      )}
    </div>
  );
}

function SuggestCard({ sg }: { sg: Suggest }) {
  const { s, update, nav, toast } = useApp();
  const { t, tt } = useI18n();
  const on = !!s.conns[sg.n.ar];
  const openM = () => { if (sg.member) nav('member'); };
  const connect = () => {
    if (!on) {
      update((p) => ({ conns: { ...p.conns, [sg.n.ar]: true } }));
      toast({ ar: 'أُرسل طلب الاتصال إلى ' + sg.n.ar, en: 'Connection request sent to ' + sg.n.en });
    }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 15, padding: '12px 14px' }}>
      <div onClick={openM} style={{ cursor: 'pointer', width: 42, height: 42, flex: 'none', borderRadius: '50%', background: sg.av, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{sg.ini}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={openM} style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>{t(sg.n)}</div>
        <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 1 }}>{t(sg.sub)}</div>
        <div style={{ fontSize: 9.5, color: 'var(--fnt)', marginTop: 2 }}>{t(sg.mut)}</div>
      </div>
      <span onClick={connect} style={{ cursor: 'pointer', flex: 'none', fontSize: 11, fontWeight: 700, color: on ? 'var(--grnTx)' : 'var(--lnk)', background: on ? 'var(--grnT)' : 'var(--priT)', borderRadius: 10, padding: '8px 13px', transition: 'all .18s' }}>{on ? tt('✓ أُرسل الطلب', '✓ Sent') : tt('+ اتصال', '+ Connect')}</span>
    </div>
  );
}

export function Network() {
  const { data, back } = useApp();
  const { tt } = useI18n();
  const stats = [
    { v: '182', l: tt('معارف', 'Connections') },
    { v: '96', l: tt('متابعون', 'Followers') },
    { v: '64', l: tt('أتابعهم', 'Following') },
  ];
  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
        <span onClick={back} style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}><Icon name="back" size={16} stroke="var(--tx)" sw={2} /></span>
        <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{tt('شبكتي المهنية', 'My professional network')}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
        {stats.map((x, i) => (
          <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 13, padding: '11px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{x.v}</div>
            <div style={{ fontSize: 9.5, color: 'var(--sub)', marginTop: 2 }}>{x.l}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 16 }}>{tt('طلبات الاتصال', 'Connection requests')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {data.connreqs.map((r) => <ConnReqCard key={r.id} r={r} />)}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 16 }}>{tt('اقتراحات ذكية لك', 'Smart suggestions for you')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, paddingBottom: 30 }}>
        {data.suggest.map((sg, i) => <SuggestCard key={i} sg={sg} />)}
      </div>
    </div>
  );
}
