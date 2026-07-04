'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Icon, Avatar } from '@/components/ui';
import { tone, scoreRing, scoreCol } from '@/lib/tokens';
import type { Post, Suggest } from '@/lib/types';

function SuggestRow({ list }: { list: Suggest[] }) {
  const { s, update, nav, toast } = useApp();
  const { t, tt } = useI18n();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 11 }}>
      {list.map((sg, i) => {
        const on = !!s.conns[sg.n.ar];
        const openM = () => { if (sg.member) nav('member'); };
        const connect = () => { if (!on) { update((p) => ({ conns: { ...p.conns, [sg.n.ar]: true } })); toast({ ar: `أُرسل طلب الاتصال إلى ${sg.n.ar}`, en: `Connection request sent to ${sg.n.en}` }); } };
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar ini={sg.ini} bg={sg.av} size={38} fontSize={12} onClick={openM} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div onClick={openM} style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{t(sg.n)}</div>
              <div style={{ fontSize: 10, color: 'var(--sub)', marginTop: 1 }}>{t(sg.sub)} · {t(sg.mut)}</div>
            </div>
            <span onClick={connect} style={{ cursor: 'pointer', flex: 'none', fontSize: 10.5, fontWeight: 700, color: on ? 'var(--grnTx)' : 'var(--lnk)', background: on ? 'var(--grnT)' : 'var(--priT)', borderRadius: 9, padding: '7px 12px', transition: 'all .18s' }}>{on ? tt('✓ أُرسل', '✓ Sent') : tt('+ اتصال', '+ Connect')}</span>
          </div>
        );
      })}
    </div>
  );
}

function PostCard({ p, i }: { p: Post; i: number }) {
  const { s, update, openC, toast } = useApp();
  const { t, tt } = useI18n();
  const tn = tone(p.tone);
  const liked = !!s.likes[p.id];
  const likeC = liked ? 'var(--red)' : 'var(--sub)';
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 18, padding: '14px 16px', boxShadow: '0 1px 2px var(--sh)', animation: 'fadeUp .32s cubic-bezier(.22,1,.36,1) both', animationDelay: `${i * 50}ms` }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <Avatar ini={p.ini} bg={p.av} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}><span style={{ fontWeight: 700 }}>{t(p.by)}</span> <span style={{ color: 'var(--sub)' }}>{t(p.act)}</span> {p.cust.ar && <span onClick={() => openC(p.cid)} style={{ fontWeight: 700, color: 'var(--lnk)', cursor: 'pointer' }}>{t(p.cust)}</span>}</div>
          <div style={{ fontSize: 10.5, color: 'var(--fnt)', marginTop: 2 }}>{t(p.when)}</div>
        </div>
        <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: tn.c, background: tn.bg, borderRadius: 7, padding: '4px 8px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: tn.d }} />{t(p.kind)}</span>
      </div>
      {p.txt.ar && <div style={{ fontSize: 13, color: 'var(--tx)', lineHeight: 1.7, marginTop: 10 }}>{t(p.txt)}</div>}
      {p.tags && p.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
          {p.tags.map((tg, k) => <span key={k} style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: tg.charAt(0) === '#' ? 'var(--lnk)' : 'var(--grnTx)' }}>{tg}</span>)}
        </div>
      )}
      {p.img && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {[1, 2, 3].map((n) => <div key={n} style={{ flex: 1, height: 92, borderRadius: 12, background: 'repeating-linear-gradient(45deg,var(--dv) 0 9px,var(--chip) 9px 18px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ font: "500 8px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>photo {n}</span></div>)}
        </div>
      )}
      {p.voice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, background: 'var(--bg)', borderRadius: 12, padding: '9px 12px' }}>
          <span style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M7 5v14l11-7z" /></svg></span>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2.5 }}>{[8, 14, 10, 17, 7, 13, 9, 15, 6, 11].map((h, k) => <span key={k} style={{ width: 3, height: h, borderRadius: 2, background: k % 2 ? 'var(--sub)' : 'var(--fnt)' }} />)}</span>
          <span style={{ font: "500 9px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>0:42</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, borderTop: '1px solid var(--dv)', paddingTop: 10 }}>
        <span onClick={() => update((q) => ({ likes: { ...q.likes, [p.id]: !q.likes[p.id] } }))} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: liked ? 700 : 500, color: likeC, padding: '6px 10px', borderRadius: 9 }}><svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? 'var(--red)' : 'none'} stroke={likeC} strokeWidth="1.9"><path d="M12 20s-7-4.5-9-9a4.8 4.8 0 0 1 9-2.5A4.8 4.8 0 0 1 21 11c-2 4.5-9 9-9 9z" /></svg>{p.likes + (liked ? 1 : 0)}</span>
        <span onClick={() => toast({ ar: `فتح التعليقات — ${p.comments} تعليق`, en: `Open comments — ${p.comments}` })} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--sub)', padding: '6px 10px', borderRadius: 9 }}><Icon name="chat" size={14} stroke="var(--sub)" sw={1.9} />{p.comments}</span>
        <span onClick={() => openC(p.cid)} style={{ cursor: 'pointer', marginInlineStart: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--pri)', background: 'var(--priT)', borderRadius: 9, padding: '7px 13px' }}>{tt('عرض العميل', 'View customer')}</span>
      </div>
    </div>
  );
}

export function Home() {
  const { s, data, set, nav, openC } = useApp();
  const { t, tt } = useI18n();
  const unread = s.notifRead ? 0 : 4;

  const feedChips = [
    { k: 'all', t: tt('الكل', 'All') }, { k: 'pay', t: tt('الدفع', 'Payment') },
    { k: 'note', t: tt('ملاحظات', 'Notes') }, { k: 'media', t: tt('صور وصوت', 'Media') },
  ];
  const posts = data.posts.filter((p) => (s.feedFilter === 'all' ? true : p.type === s.feedFilter));

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px 0' }}>
        <Avatar ini="أش" bg="var(--pri)" size={42} fontSize={14} onClick={() => set({ screen: 'me', stack: ['home'] })} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16.5, fontWeight: 700 }}>{tt('مساء الخير، أحمد', 'Good evening, Ahmed')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 1 }}>{tt('الجمعة 4 يوليو · 5 زيارات مجدولة اليوم', 'Friday 4 Jul · 5 visits scheduled today')}</div>
        </div>
        <div onClick={() => nav('messages')} style={{ cursor: 'pointer', position: 'relative', width: 40, height: 40, flex: 'none', borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chatLines" size={17} stroke="var(--tx)" />
          <span style={{ position: 'absolute', top: 6, insetInlineStart: 7, minWidth: 15, height: 15, background: 'var(--pri)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg)', padding: '0 2px' }}>2</span>
        </div>
        <div onClick={() => nav('notif')} style={{ cursor: 'pointer', position: 'relative', width: 40, height: 40, flex: 'none', borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="bell" size={17} stroke="var(--tx)" />
          {unread > 0 && <span style={{ position: 'absolute', top: 6, insetInlineStart: 7, minWidth: 15, height: 15, background: 'var(--org)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg)', padding: '0 2px' }}>{unread}</span>}
        </div>
      </div>
      <div onClick={() => set({ screen: 'search', stack: ['home'], query: '' })} style={{ cursor: 'pointer', margin: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 13, padding: '12px 14px' }}>
        <Icon name="search" size={16} stroke="var(--fnt)" />
        <span style={{ fontSize: 13, color: 'var(--fnt)' }}>{tt('ابحث في كل شيء — عملاء، جهات، أرقام، وظائف…', 'Search everything — customers, contacts, numbers, jobs…')}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{tt('محدث مؤخرًا', 'Recently updated')}</span>
        <span onClick={() => set({ screen: 'customers', stack: [] })} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--lnk)' }}>{tt('كل العملاء', 'All customers')}</span>
      </div>
      <div data-scroll="true" style={{ display: 'flex', gap: 9, padding: '10px 20px 4px', overflowX: 'auto' }}>
        {data.customers.map((x) => {
          const name = t(x.name);
          const short = name.length > 16 ? name.slice(0, 15) + '…' : name;
          return (
            <div key={x.id} onClick={() => openC(x.id)} style={{ cursor: 'pointer', flex: 'none', width: 118, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 15, padding: '11px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: scoreRing(x.score), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 12, fontWeight: 700, color: scoreCol(x.score) }}>{x.score}</span></div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.4, color: 'var(--tx)' }}>{short}</span>
              <span style={{ fontSize: 9, color: 'var(--fnt)' }}>{t(x.updWhen)}</span>
            </div>
          );
        })}
      </div>
      <div data-scroll="true" style={{ display: 'flex', gap: 8, padding: '12px 20px 2px', overflowX: 'auto' }}>
        {feedChips.map((f) => {
          const on = s.feedFilter === f.k;
          return <span key={f.k} onClick={() => set({ feedFilter: f.k })} style={{ cursor: 'pointer', flex: 'none', fontSize: 12, fontWeight: on ? 700 : 500, padding: '7px 14px', borderRadius: 99, background: on ? 'var(--pri)' : 'var(--card)', color: on ? 'var(--onPri)' : 'var(--sub)', border: `1px solid ${on ? 'var(--pri)' : 'var(--bd)'}`, transition: 'all .18s', userSelect: 'none' }}>{f.t}</span>;
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 20px 96px' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 18, padding: '13px 16px', boxShadow: '0 1px 2px var(--sh)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, fontWeight: 700 }}>{tt('أشخاص قد تعرفهم', 'People you may know')}</span><span onClick={() => nav('network')} style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 700, color: 'var(--lnk)' }}>{tt('شبكتي', 'My network')}</span></div>
          <SuggestRow list={data.suggest.slice(0, 2)} />
        </div>
        {posts.map((p, i) => <PostCard key={p.id} p={p} i={i} />)}
      </div>
    </div>
  );
}
