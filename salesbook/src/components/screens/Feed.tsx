'use client';
import { useState } from 'react';
import { ImagePlus, Store, X, Send } from 'lucide-react';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Icon, Avatar } from '@/components/ui';
import { tone } from '@/lib/tokens';
import type { L, Post, PostType, Suggest } from '@/lib/types';

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
            <span onClick={connect} style={{ cursor: 'pointer', flex: 'none', fontSize: 10.5, fontWeight: 700, color: on ? 'var(--grnTx)' : 'var(--lnk)', background: on ? 'var(--grnT)' : 'var(--priT)', borderRadius: 10, padding: '7px 12px', transition: 'all .18s' }}>{on ? tt('✓ أُرسل', '✓ Sent') : tt('+ اتصال', '+ Connect')}</span>
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
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 20, padding: '14px 16px', boxShadow: 'var(--shadow-sm)', animation: 'fadeUp .32s cubic-bezier(.22,1,.36,1) both', animationDelay: `${i * 50}ms` }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <Avatar ini={p.ini} bg={p.av} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}><span style={{ fontWeight: 700 }}>{t(p.by)}</span> <span style={{ color: 'var(--sub)' }}>{t(p.act)}</span> {p.cust.ar && <span onClick={() => openC(p.cid)} style={{ fontWeight: 700, color: 'var(--lnk)', cursor: 'pointer' }}>{t(p.cust)}</span>}</div>
          <div style={{ fontSize: 10.5, color: 'var(--fnt)', marginTop: 2 }}>{t(p.when)}</div>
        </div>
        <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: tn.c, background: tn.bg, borderRadius: 8, padding: '4px 8px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: tn.d }} />{t(p.kind)}</span>
      </div>
      {p.txt.ar && <div style={{ fontSize: 13, color: 'var(--tx)', lineHeight: 1.7, marginTop: 10 }}>{t(p.txt)}</div>}
      {p.tags && p.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
          {p.tags.map((tg, k) => <span key={k} style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: tg.charAt(0) === '#' ? 'var(--lnk)' : 'var(--grnTx)' }}>{tg}</span>)}
        </div>
      )}
      {p.img && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {[1, 2, 3].map((n) => <div key={n} style={{ flex: 1, height: 92, borderRadius: 14, background: 'repeating-linear-gradient(45deg,var(--dv) 0 9px,var(--chip) 9px 18px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ font: "500 8px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>photo {n}</span></div>)}
        </div>
      )}
      {p.voice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, background: 'var(--bg)', borderRadius: 14, padding: '9px 12px' }}>
          <span style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M7 5v14l11-7z" /></svg></span>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2.5 }}>{[8, 14, 10, 17, 7, 13, 9, 15, 6, 11].map((h, k) => <span key={k} style={{ width: 3, height: h, borderRadius: 2, background: k % 2 ? 'var(--sub)' : 'var(--fnt)' }} />)}</span>
          <span style={{ font: "500 9px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>0:42</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, borderTop: '1px solid var(--dv)', paddingTop: 10 }}>
        <span onClick={() => update((q) => ({ likes: { ...q.likes, [p.id]: !q.likes[p.id] } }))} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: liked ? 700 : 500, color: likeC, padding: '6px 10px', borderRadius: 10 }}><svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? 'var(--red)' : 'none'} stroke={likeC} strokeWidth="1.9" aria-hidden><path d="M12 20s-7-4.5-9-9a4.8 4.8 0 0 1 9-2.5A4.8 4.8 0 0 1 21 11c-2 4.5-9 9-9 9z" /></svg>{p.likes + (liked ? 1 : 0)}</span>
        <span onClick={() => toast({ ar: `فتح التعليقات — ${p.comments} تعليق`, en: `Open comments — ${p.comments}` })} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--sub)', padding: '6px 10px', borderRadius: 10 }}><Icon name="chat" size={14} stroke="var(--sub)" sw={1.9} />{p.comments}</span>
        <span onClick={() => openC(p.cid)} style={{ cursor: 'pointer', marginInlineStart: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--pri)', background: 'var(--priT)', borderRadius: 10, padding: '7px 13px' }}>{tt('عرض العميل', 'View customer')}</span>
      </div>
    </div>
  );
}

/* Bottom-sheet post composer: text + type + optional photos + customer tag. */
function Composer({ onClose }: { onClose: () => void }) {
  const { data, update, toast } = useApp();
  const { t, tt } = useI18n();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<PostType>('note');
  const [photos, setPhotos] = useState(0);
  const [custId, setCustId] = useState<string>('');

  const kinds: { k: PostType; t: string; label: L; tone: Post['tone'] }[] = [
    { k: 'note', t: tt('تحديث ميداني', 'Field update'), label: { ar: 'تحديث ميداني', en: 'Field update' }, tone: 'b' },
    { k: 'pay', t: tt('نصيحة مبيعات', 'Sales tip'), label: { ar: 'نصيحة مبيعات', en: 'Sales tip' }, tone: 'g' },
    { k: 'media', t: tt('إنجاز', 'Achievement'), label: { ar: 'إنجاز', en: 'Achievement' }, tone: 'a' },
  ];

  const publish = () => {
    const body = text.trim();
    if (!body) { toast({ ar: 'اكتب شيئًا أولًا', en: 'Write something first' }); return; }
    const cust = data.customers.find((c) => c.id === custId);
    const sel = kinds.find((x) => x.k === kind) || kinds[0];
    const post: Post = {
      id: `my${Date.now()}`, type: kind,
      by: { ar: 'أحمد الشمري', en: 'Ahmed Al-Shammari' }, ini: 'أش', av: 'var(--pri)',
      act: cust ? { ar: 'شارك تحديثًا عن', en: 'shared an update about' } : { ar: 'شارك مع المجتمع', en: 'shared with the community' },
      cid: cust?.id || 'n1', cust: cust ? cust.name : { ar: '', en: '' },
      when: { ar: 'الآن', en: 'now' }, txt: { ar: body, en: body },
      kind: sel.label, tone: sel.tone, img: photos > 0, voice: false, likes: 0, comments: 0,
    };
    update((p) => ({ myPosts: [post, ...p.myPosts] }));
    toast({ ar: 'نُشر تحديثك على المنصة 🎉', en: 'Your update is live on the feed 🎉' });
    onClose();
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--ov)', zIndex: 70, animation: 'fadeIn .2s both' }} />
      <div role="dialog" aria-modal="true" aria-label={tt('منشور جديد', 'New post')} style={{ position: 'fixed', bottom: 0, insetInlineStart: 0, insetInlineEnd: 0, zIndex: 71, maxWidth: 640, margin: '0 auto', background: 'var(--card)', borderRadius: '24px 24px 0 0', padding: '10px 20px calc(22px + var(--safe-bottom))', animation: 'slideUp .3s cubic-bezier(.22,1,.36,1) both', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ width: 38, height: 4.5, borderRadius: 3, background: 'var(--dv)', margin: '4px auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15.5, fontWeight: 700 }}>{tt('منشور جديد', 'New post')}</span>
          <button onClick={onClose} aria-label={tt('إغلاق', 'Close')} style={{ border: 'none', background: 'var(--chip)', cursor: 'pointer', width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sub)' }}><X size={15} aria-hidden /></button>
        </div>
        <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
          {kinds.map((x) => {
            const on = kind === x.k;
            return <button key={x.k} onClick={() => setKind(x.k)} style={{ border: `1px solid ${on ? 'var(--pri)' : 'var(--bd)'}`, cursor: 'pointer', fontSize: 11.5, fontWeight: on ? 700 : 500, padding: '8px 13px', borderRadius: 99, background: on ? 'var(--priT)' : 'var(--card)', color: on ? 'var(--pri)' : 'var(--sub)', transition: 'all .18s' }}>{x.t}</button>;
          })}
        </div>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus
          placeholder={tt('شارك خبرة، نصيحة، أو تحديثًا من الميدان…', 'Share an insight, a tip, or an update from the field…')}
          aria-label={tt('نص المنشور', 'Post text')}
          style={{ width: '100%', marginTop: 12, border: '1.5px solid var(--bd)', borderRadius: 16, background: 'var(--bg)', color: 'var(--tx)', fontSize: 13.5, lineHeight: 1.7, padding: '12px 14px', outline: 'none', resize: 'none' }}
        />
        {custId && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11.5, fontWeight: 700, color: 'var(--pri)', background: 'var(--priT)', borderRadius: 99, padding: '6px 12px' }}>
            <Store size={13} aria-hidden />{t(data.customers.find((c) => c.id === custId)?.name || { ar: '', en: '' })}
            <button onClick={() => setCustId('')} aria-label={tt('إزالة العميل', 'Remove customer')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--pri)', display: 'flex', padding: 0 }}><X size={12} aria-hidden /></button>
          </div>
        )}
        {photos > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {Array.from({ length: photos }).map((_, n) => (
              <div key={n} style={{ flex: 1, maxWidth: 110, height: 74, borderRadius: 12, background: 'repeating-linear-gradient(45deg,var(--dv) 0 9px,var(--chip) 9px 18px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ font: "500 8px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>photo {n + 1}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <button onClick={() => { if (photos < 3) { setPhotos(photos + 1); toast({ ar: 'أُرفقت صورة من المعرض', en: 'Photo attached from gallery' }); } }} aria-label={tt('إرفاق صورة', 'Attach photo')} style={{ border: '1px solid var(--bd)', cursor: 'pointer', width: 42, height: 42, borderRadius: 13, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sub)' }}>
            <ImagePlus size={18} strokeWidth={1.9} aria-hidden />
          </button>
          <div style={{ position: 'relative', width: 42, height: 42, flex: 'none' }}>
            <select value={custId} onChange={(e) => setCustId(e.target.value)} aria-label={tt('ربط بعميل', 'Tag a customer')} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
              <option value="">{tt('بدون عميل', 'No customer')}</option>
              {data.customers.map((c) => <option key={c.id} value={c.id}>{t(c.name)}</option>)}
            </select>
            <span style={{ pointerEvents: 'none', position: 'absolute', inset: 0, border: '1px solid var(--bd)', borderRadius: 13, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: custId ? 'var(--pri)' : 'var(--sub)' }}>
              <Store size={18} strokeWidth={1.9} aria-hidden />
            </span>
          </div>
          <button onClick={publish} style={{ flex: 1, border: 'none', cursor: 'pointer', height: 46, borderRadius: 14, background: 'var(--pri)', color: 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, boxShadow: 'var(--shadow-md)' }}>
            <Send size={15} aria-hidden />{tt('نشر', 'Publish')}
          </button>
        </div>
      </div>
    </>
  );
}

/* Team activity feed — live customer updates from the field. */
export function Feed() {
  const { s, data, set, nav } = useApp();
  const { tt } = useI18n();
  const [composing, setComposing] = useState(false);

  const feedChips = [
    { k: 'all', t: tt('الكل', 'All') }, { k: 'pay', t: tt('الدفع', 'Payment') },
    { k: 'note', t: tt('ملاحظات', 'Notes') }, { k: 'media', t: tt('صور وصوت', 'Media') },
  ];
  const posts = [...s.myPosts, ...data.posts].filter((p) => (s.feedFilter === 'all' ? true : p.type === s.feedFilter));

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>{tt('المنصة', 'Feed')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 2 }}>{tt('آخر تحديثات فريقك على العملاء', 'Your team’s latest customer updates')}</div>
        </div>
        <button onClick={() => set({ screen: 'search', stack: ['feed'], query: '' })} aria-label={tt('بحث', 'Search')} style={{ border: '1px solid var(--bd)', cursor: 'pointer', width: 40, height: 40, borderRadius: '50%', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx)' }}>
          <Icon name="search" size={17} stroke="currentColor" />
        </button>
      </div>
      {/* composer trigger */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '14px 20px 0', background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 18, padding: '12px 14px', boxShadow: 'var(--shadow-sm)' }}>
        <Avatar ini="أش" bg="var(--pri)" size={38} fontSize={12} />
        <button onClick={() => setComposing(true)} style={{ flex: 1, border: 'none', cursor: 'pointer', textAlign: 'start', background: 'var(--bg)', borderRadius: 99, padding: '11px 16px', fontSize: 12.5, color: 'var(--fnt)' }}>
          {tt('شارك تحديثًا مع مجتمع المبيعات…', 'Share an update with the sales community…')}
        </button>
        <button onClick={() => setComposing(true)} aria-label={tt('إرفاق صورة', 'Attach photo')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--pri)', display: 'flex', padding: 4 }}>
          <ImagePlus size={20} strokeWidth={1.9} aria-hidden />
        </button>
      </div>

      <div data-scroll="true" style={{ display: 'flex', gap: 8, padding: '14px 20px 2px', overflowX: 'auto' }}>
        {feedChips.map((f) => {
          const on = s.feedFilter === f.k;
          return <span key={f.k} onClick={() => set({ feedFilter: f.k })} style={{ cursor: 'pointer', flex: 'none', fontSize: 12, fontWeight: on ? 700 : 500, padding: '8px 16px', borderRadius: 99, background: on ? 'var(--pri)' : 'var(--card)', color: on ? 'var(--onPri)' : 'var(--sub)', border: `1px solid ${on ? 'var(--pri)' : 'var(--bd)'}`, transition: 'all .18s', userSelect: 'none' }}>{f.t}</span>;
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 20px 24px' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 20, padding: '13px 16px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, fontWeight: 700 }}>{tt('أشخاص قد تعرفهم', 'People you may know')}</span><span onClick={() => nav('network')} style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 700, color: 'var(--lnk)' }}>{tt('شبكتي', 'My network')}</span></div>
          <SuggestRow list={data.suggest.slice(0, 2)} />
        </div>
        {posts.map((p, i) => <PostCard key={p.id} p={p} i={i} />)}
      </div>
      {composing && <Composer onClose={() => setComposing(false)} />}
    </div>
  );
}
