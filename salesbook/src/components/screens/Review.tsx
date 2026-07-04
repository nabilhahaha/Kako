'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Icon } from '@/components/ui';
import type { ReviewItem } from '@/lib/types';

function ReviewCard({ v }: { v: ReviewItem }) {
  const { s, approveReview, rejectReview, toast } = useApp();
  const { t, tt } = useI18n();
  const st = s.reviews[v.id];

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{t(v.field)}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--lnk)', background: 'var(--priT)', borderRadius: 6, padding: '2.5px 7px' }}>{t(v.kind)}</span>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 3 }}>{t(v.cust)} · {t(v.by)} · {t(v.when)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 10, background: 'var(--bg)', borderRadius: 11, padding: '10px 12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--fnt)', textDecoration: 'line-through' }}>{t(v.old)}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--fnt)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'scaleX(-1)' }}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--grnTx)' }}>{t(v.nw)}</span>
      </div>
      {st === 'pending' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
          <span onClick={() => approveReview(v.id)} style={{ cursor: 'pointer', flex: 1, height: 40, borderRadius: 11, background: 'var(--grn)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'transform .15s' }}>{tt('✓ اعتماد', '✓ Approve')}</span>
          <span onClick={() => rejectReview(v.id)} style={{ cursor: 'pointer', flex: 1, height: 40, borderRadius: 11, background: 'var(--redT)', color: 'var(--redTx)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'transform .15s' }}>{tt('رفض', 'Reject')}</span>
          <span onClick={() => toast({ ar: 'طُلبت تعديلات من ' + v.by.ar, en: 'Changes requested from ' + v.by.en })} style={{ cursor: 'pointer', flex: 1, height: 40, borderRadius: 11, background: 'var(--card)', border: '1px solid var(--bd)', color: 'var(--tx)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'transform .15s' }}>{tt('طلب تعديل', 'Request changes')}</span>
        </div>
      )}
      {st === 'approved' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, background: 'var(--grnT)', borderRadius: 11, padding: '10px 13px', animation: 'fadeUp .3s both' }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--grn)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>✓</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--grnTx)' }}>{tt('معتمد — أصبح مرئيًا للجميع وسُجّل في السجل', 'Approved — now visible to everyone and logged in history')}</span>
        </div>
      )}
      {st === 'rejected' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, background: 'var(--redT)', borderRadius: 11, padding: '10px 13px', animation: 'fadeUp .3s both' }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>×</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--redTx)' }}>{tt('مرفوض — أُبلغ المندوب بالسبب', 'Rejected — the rep was notified of the reason')}</span>
        </div>
      )}
    </div>
  );
}

export function Review() {
  const { s, data, back } = useApp();
  const { tt } = useI18n();
  const pend = data.reviews.filter((v) => s.reviews[v.id] === 'pending').length;
  const reviewEmpty = pend === 0;
  const revPendTxt = pend ? tt(`${pend} تحديثات بانتظار مراجعتك`, `${pend} updates awaiting your review`) : tt('كل شيء تمت مراجعته', 'Everything is reviewed');

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
        <span onClick={back} style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}><Icon name="back" size={16} stroke="var(--tx)" sw={2} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{tt('قائمة المراجعة', 'Review queue')}</div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 1 }}>{revPendTxt}{tt(' — يظهر المعتمد فقط للجميع', ' — only approved is visible to everyone')}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ambTx)', background: 'var(--ambT)', borderRadius: 99, padding: '4px 10px' }}>{tt('مشرف', 'Supervisor')}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, paddingBottom: 30 }}>
        {data.reviews.map((v) => <ReviewCard key={v.id} v={v} />)}
        {reviewEmpty && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 50, animation: 'fadeUp .3s both' }}>
            <div style={{ width: 74, height: 74, borderRadius: '50%', background: 'var(--grnT)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--grn)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></div>
            <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 16 }}>{tt('كل شيء تمت مراجعته', 'Everything is reviewed')}</div>
            <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 6, lineHeight: 1.7 }}>{tt('لا توجد تحديثات بانتظارك —', 'No updates awaiting you —')}<br />{tt('ستصلك التنبيهات فور وصول تقارير جديدة', 'you’ll be notified as soon as new reports arrive')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
