'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';

export function Member() {
  const { s, data, update, back, openChat, toast } = useApp();
  const { t, tt } = useI18n();
  const member = data.member;
  const on = !!s.conns[member.n.ar];
  const connect = () => {
    if (!on) {
      update((p) => ({ conns: { ...p.conns, [member.n.ar]: true } }));
      toast({ ar: 'أُرسل طلب الاتصال', en: 'Connection request sent' });
    }
  };
  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ height: 86, background: 'repeating-linear-gradient(45deg,var(--dv) 0 10px,var(--chip) 10px 20px)', position: 'relative', flex: 'none' }}>
        <span onClick={back} style={{ cursor: 'pointer', position: 'absolute', top: 10, insetInlineStart: 12, width: 34, height: 34, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tx)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg></span>
      </div>
      <div style={{ padding: '0 20px', marginTop: -28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ width: 72, height: 72, flex: 'none', borderRadius: '50%', background: member.av, border: '3px solid var(--bg)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 700 }}>{member.ini}</div>
          <div style={{ flex: 1, paddingBottom: 4 }}>
            <div style={{ fontSize: 16.5, fontWeight: 700 }}>{t(member.n)}</div>
            <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{t(member.title)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 9 }}>
          <span style={{ fontSize: 11, color: 'var(--sub)' }}>{t(member.city)}</span>
          <span style={{ fontSize: 11, color: 'var(--sub)' }}><span style={{ fontWeight: 700, color: 'var(--tx)' }}>{member.conns}</span> {tt('معرفة', 'connections')}</span>
          <span style={{ fontSize: 11, color: 'var(--fnt)' }}>{t(member.mut)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--grnTx)', background: 'var(--grnT)', borderRadius: 99, padding: '5px 11px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--grn)' }} />{tt('سمعة', 'Reputation')} {member.pts}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ambTx)', background: 'var(--ambT)', borderRadius: 99, padding: '5px 11px' }}>{tt('موثِّق ذهبي', 'Gold verifier')}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <span onClick={connect} style={{ cursor: 'pointer', flex: 1, height: 42, borderRadius: 12, background: on ? 'var(--grnT)' : 'var(--pri)', color: on ? 'var(--grnTx)' : 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, transition: 'all .2s' }}>{on ? tt('✓ أُرسل الطلب', '✓ Sent') : tt('+ اتصال', '+ Connect')}</span>
          <span onClick={() => openChat('t1')} style={{ cursor: 'pointer', flex: 1, height: 42, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', color: 'var(--tx)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, transition: 'transform .15s' }}>{tt('مراسلة', 'Message')}</span>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 15px', marginTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{tt('نبذة', 'About')}</div>
          <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.75, marginTop: 6 }}>{t(member.about)}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 15px', marginTop: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{tt('الخبرة العملية', 'Experience')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {member.exp.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, background: 'var(--priT)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 700 }}>{t(e.r)}</div><div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 1 }}>{t(e.co)} · {t(e.per)}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 15px', marginTop: 10, marginBottom: 30 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{tt('المهارات', 'Skills')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
            {member.skills.map((sk, i) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--lnk)', background: 'var(--priT)', borderRadius: 99, padding: '5px 12px' }}>{t(sk)}</span>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, borderTop: '1px solid var(--dv)', paddingTop: 10 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--amb)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM8.5 14 7 21l5-3 5 3-1.5-7" /></svg>
            {member.certs.map((ce, i) => <span key={i} style={{ fontSize: 11, color: 'var(--sub)' }}>{t(ce)}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
