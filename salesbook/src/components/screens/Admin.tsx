'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Icon } from '@/components/ui';
import type { MembershipRequest } from '@/lib/types';

function RequestCard({ r }: { r: MembershipRequest }) {
  const { s, set, approveRequest, toast } = useApp();
  const { t, tt } = useI18n();
  const st = s.requests[r.id];

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '14px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--lnk)' }}>{r.ini}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t(r.n)}</div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{t(r.job)} · {t(r.co)}</div>
        </div>
        <span style={{ fontSize: 9.5, color: 'var(--fnt)' }}>{t(r.when)}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 10, background: 'var(--bg)', borderRadius: 11, padding: '9px 12px' }}>
        <span style={{ fontSize: 10.5, color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="phone" size={11} stroke="var(--fnt)" sw={2} /><span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{r.phone}</span></span>
        <span style={{ fontSize: 10.5, color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="pin" size={11} stroke="var(--fnt)" sw={2} />{t(r.city)}</span>
      </div>
      {st === 'pending' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
          <span onClick={() => approveRequest(r.id)} style={{ cursor: 'pointer', flex: 1, height: 40, borderRadius: 11, background: 'var(--grn)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'transform .15s' }}>{tt('✓ اعتماد', '✓ Approve')}</span>
          <span onClick={() => set({ rejectFor: r.id, rejReason: null })} style={{ cursor: 'pointer', flex: 1, height: 40, borderRadius: 11, background: 'var(--redT)', color: 'var(--redTx)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'transform .15s' }}>{tt('رفض', 'Reject')}</span>
          <span onClick={() => toast({ ar: 'أُرسل طلب معلومات إضافية إلى ' + r.n.ar, en: 'Requested more info from ' + r.n.en })} style={{ cursor: 'pointer', flex: 1, height: 40, borderRadius: 11, background: 'var(--card)', border: '1px solid var(--bd)', color: 'var(--tx)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'transform .15s' }}>{tt('معلومات إضافية', 'More info')}</span>
        </div>
      )}
      {st === 'approved' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, background: 'var(--grnT)', borderRadius: 11, padding: '10px 13px', animation: 'fadeUp .3s both' }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--grn)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>✓</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--grnTx)' }}>{tt('معتمد — أُرسل إشعار الترحيب للمتقدم', 'Approved — welcome notice sent to the applicant')}</span>
        </div>
      )}
      {st === 'rejected' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, background: 'var(--redT)', borderRadius: 11, padding: '10px 13px', animation: 'fadeUp .3s both' }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>×</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--redTx)' }}>{tt('مرفوض — أُرسل السبب للمتقدم تلقائيًا', 'Rejected — reason sent to the applicant automatically')}</span>
        </div>
      )}
    </div>
  );
}

export function Admin() {
  const { s, data, back } = useApp();
  const { tt } = useI18n();
  const reqPend = data.requests.filter((r) => s.requests[r.id] === 'pending').length;

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
        <span onClick={back} style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}><Icon name="back" size={16} stroke="var(--tx)" sw={2} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{tt('طلبات العضوية', 'Membership requests')}</div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 1 }}>{tt(`${reqPend} طلبات بانتظار الاعتماد`, `${reqPend} requests awaiting approval`)}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--orgTx)', background: 'var(--orgT)', borderRadius: 99, padding: '4px 10px' }}>{tt('صلاحية مسؤول', 'Admin access')}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, paddingBottom: 30 }}>
        {data.requests.map((r) => <RequestCard key={r.id} r={r} />)}
      </div>
    </div>
  );
}
