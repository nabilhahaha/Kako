'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { tone } from '@/lib/tokens';
import type { ChatMsg } from '@/lib/types';

const backBtn = {
  cursor: 'pointer', width: 36, height: 36, borderRadius: 12, background: 'var(--card)',
  border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'transform .15s',
} as const;

function BackChevron({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--tx)" strokeWidth={2}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/* ============ MESSAGES ============ */
export function Messages() {
  const { data, back, openChat } = useApp();
  const { t, tt } = useI18n();
  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
        <span onClick={back} style={backBtn}><BackChevron /></span>
        <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{tt('الرسائل', 'Messages')}</div></div>
        <span style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: 12, background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, paddingBottom: 30 }}>
        {data.chats.map((ch) => (
          <div key={ch.id} onClick={() => openChat(ch.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 15, padding: '12px 14px', transition: 'transform .15s' }}>
            <div style={{ position: 'relative', flex: 'none' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: ch.av, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{ch.ini}</div>
              {ch.online && <span style={{ position: 'absolute', bottom: 1, insetInlineStart: 1, width: 11, height: 11, borderRadius: '50%', background: 'var(--grn)', border: '2px solid var(--card)' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{t(ch.n)}</span>
                <span style={{ marginInlineStart: 'auto', fontSize: 9.5, color: 'var(--fnt)' }}>{t(ch.when)}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(ch.last)}</div>
            </div>
            {ch.unread > 0 && <span style={{ flex: 'none', minWidth: 19, height: 19, background: 'var(--pri)', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{ch.unread}</span>}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--priT)', borderRadius: 12, padding: '10px 13px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth={2}><rect x="4" y="6" width="16" height="14" rx="2.5" /><path d="M8 6V5a4 4 0 0 1 8 0v1" /></svg>
          <span style={{ fontSize: 11, color: 'var(--lnk)', lineHeight: 1.6 }}>{tt('شارك بطاقات العملاء والمنشورات داخل المحادثات — يفتحها زميلك بنقرة', 'Share customer cards and posts inside chats — your colleague opens them with one tap')}</span>
        </div>
      </div>
    </div>
  );
}

/* ============ CHAT THREAD ============ */
function MsgBubble({ m, chatOpenCust }: { m: ChatMsg; chatOpenCust: () => void }) {
  const { t, tt } = useI18n();
  const isTxt = !m.kind;
  const isCust = m.kind === 'cust';
  const isVoice = m.kind === 'voice';
  const bg = m.me ? 'var(--pri)' : 'var(--card)';
  const c = m.me ? 'var(--onPri)' : 'var(--tx)';
  const bd = m.me ? 'var(--pri)' : 'var(--bd)';
  const rad = m.me ? '16px 16px 4px 16px' : '16px 16px 16px 4px';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignSelf: m.me ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
      {isTxt && (
        <div style={{ background: bg, color: c, border: `1px solid ${bd}`, borderRadius: rad, padding: '10px 13px', fontSize: 12.5, lineHeight: 1.65, animation: 'fadeUp .25s both' }}>{t(m.t)}</div>
      )}
      {isCust && (
        <div onClick={chatOpenCust} style={{ cursor: 'pointer', background: 'var(--card)', border: '1.5px solid var(--pri)', borderRadius: 16, padding: '11px 13px', width: 230, animation: 'fadeUp .25s both', transition: 'transform .15s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 38, height: 38, flex: 'none', borderRadius: 11, background: 'repeating-linear-gradient(45deg,var(--dv) 0 8px,var(--chip) 8px 16px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ font: "500 7px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>store</span></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{tt('أسواق النخيل التجارية', 'Al Nakheel Commercial Markets')}</div>
              <div style={{ fontSize: 9.5, color: 'var(--sub)', marginTop: 1 }}>{tt('الرياض · العليا · مؤشر 92', 'Riyadh · Al Olaya · Score 92')}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, borderTop: '1px solid var(--dv)', paddingTop: 7 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--lnk)' }}>{tt('بطاقة عميل — اضغط للفتح', 'Customer card — tap to open')}</span>
            <svg style={{ marginInlineStart: 'auto' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth={2}><path d="m15 6-6 6 6 6" /></svg>
          </div>
        </div>
      )}
      {isVoice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: '16px 16px 16px 4px', padding: '9px 12px', width: 210, animation: 'fadeUp .25s both' }}>
          <span style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M7 5v14l11-7z" /></svg></span>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2.5 }}>
            {[8, 14, 9, 16, 7, 12].map((h, k) => <span key={k} style={{ width: 3, height: h, borderRadius: 2, background: k % 2 ? 'var(--sub)' : 'var(--fnt)' }} />)}
          </span>
          <span style={{ font: "500 9px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>0:31</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, alignSelf: 'flex-end' }}>
        <span style={{ fontSize: 8.5, color: 'var(--fnt)' }}>{t(m.when)}</span>
        {m.read && <span style={{ fontSize: 9, color: 'var(--lnk)', fontWeight: 700 }}>✓✓</span>}
      </div>
    </div>
  );
}

export function Chat() {
  const { s, data, set, back, nav, openC, sendMsg } = useApp();
  const { t, tt } = useI18n();
  const chat = data.chats.find((c) => c.id === s.chatId) || data.chats[0];
  const msgs = s.chatMsgs ?? data.chatseed;
  const chatOpenCust = () => openC('n1');
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px 10px', borderBottom: '1px solid var(--dv)', background: 'var(--card)' }}>
        <span onClick={back} style={{ cursor: 'pointer', width: 34, height: 34, flex: 'none', borderRadius: 11, background: 'var(--bg)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tx)" strokeWidth={2}><path d="m9 6 6 6-6 6" /></svg>
        </span>
        <div onClick={() => nav('member')} style={{ cursor: 'pointer', position: 'relative', flex: 'none' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: chat.av, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700 }}>{chat.ini}</div>
          <span style={{ position: 'absolute', bottom: 0, insetInlineStart: 0, width: 10, height: 10, borderRadius: '50%', background: 'var(--grn)', border: '2px solid var(--card)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t(chat.n)}</div>
          <div style={{ fontSize: 10, color: 'var(--grnTx)', marginTop: 1 }}>{tt('متصل الآن', 'Online now')}</div>
        </div>
        <span onClick={chatOpenCust} style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 700, color: 'var(--lnk)', background: 'var(--priT)', borderRadius: 9, padding: '7px 11px', transition: 'transform .15s' }}>{tt('ملف العميل', 'Customer profile')}</span>
      </div>
      <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9, padding: '14px 18px' }}>
        {msgs.map((m, i) => <MsgBubble key={i} m={m} chatOpenCust={chatOpenCust} />)}
        {s.typing && (
          <div style={{ alignSelf: 'flex-start', background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: '16px 16px 16px 4px', padding: '12px 16px', display: 'flex', gap: 4, animation: 'fadeUp .2s both' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--fnt)', animation: 'recPulse 1s infinite' }} />
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--fnt)', animation: 'recPulse 1s .2s infinite' }} />
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--fnt)', animation: 'recPulse 1s .4s infinite' }} />
          </div>
        )}
      </div>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 18px', background: 'var(--card)', borderTop: '1px solid var(--dv)' }}>
        <span style={{ cursor: 'pointer', width: 38, height: 38, flex: 'none', borderRadius: '50%', background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth={1.9}><path d="M12 5v14M5 12h14" /></svg>
        </span>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 99, padding: '0 14px', height: 42 }}>
          <input value={s.chatInput} onChange={(e) => set({ chatInput: e.target.value })} placeholder={tt('اكتب رسالة…', 'Type a message…')} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: 'var(--tx)' }} />
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--fnt)" strokeWidth={1.9} style={{ cursor: 'pointer' }}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        </div>
        <span onClick={sendMsg} style={{ cursor: 'pointer', width: 42, height: 42, flex: 'none', borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px var(--sh)', transition: 'transform .15s' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} style={{ transform: 'scaleX(-1) rotate(40deg)' }}><path d="m3 11 18-8-8 18-2-8z" /></svg>
        </span>
      </div>
    </div>
  );
}

/* ============ GROUPS ============ */
export function Groups() {
  const { s, data, back, update, toast } = useApp();
  const { t, tt } = useI18n();
  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
        <span onClick={back} style={backBtn}><BackChevron /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{tt('المجموعات المهنية', 'Professional groups')}</div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 1 }}>{tt('مجتمعات متخصصة — محتوى مهني فقط', 'Specialized communities — professional content only')}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12, paddingBottom: 30 }}>
        {data.groups.map((g) => {
          const j = !!s.joined[g.id];
          const tn = tone(g.tone);
          const join = () => {
            update((p) => ({ joined: { ...p.joined, [g.id]: !j } }));
            toast(j ? { ar: 'غادرت المجموعة', en: 'You left the group' } : { ar: 'انضممت إلى ' + g.n.ar, en: 'Joined ' + g.n.en });
          };
          return (
            <div key={g.id} style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 46, height: 46, flex: 'none', borderRadius: 13, background: tn.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: tn.c }}>{g.ini}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{t(g.n)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 2 }}>{t(g.mem)} · {t(g.act)}</div>
                </div>
                <span onClick={join} style={{ cursor: 'pointer', flex: 'none', fontSize: 11.5, fontWeight: 700, color: j ? 'var(--grnTx)' : 'var(--onPri)', background: j ? 'var(--grnT)' : 'var(--pri)', borderRadius: 10, padding: '8px 14px', transition: 'all .2s' }}>{j ? tt('✓ عضو', '✓ Member') : tt('انضمام', 'Join')}</span>
              </div>
            </div>
          );
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--priT)', borderRadius: 12, padding: '10px 13px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></svg>
          <span style={{ fontSize: 11, color: 'var(--lnk)', lineHeight: 1.6 }}>{tt('المجموعات تدعم المنشورات المثبتة والملفات والمشرفين — بمحتوى مهني حصرًا', 'Groups support pinned posts, files, and moderators — professional content only')}</span>
        </div>
      </div>
    </div>
  );
}

/* ============ EVENTS ============ */
export function Events() {
  const { s, data, back, update, toast } = useApp();
  const { t, tt } = useI18n();
  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
        <span onClick={back} style={backBtn}><BackChevron /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{tt('الفعاليات والتدريب', 'Events & training')}</div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 1 }}>{tt('سجّل حضورك وستصلك التذكيرات تلقائيًا', 'RSVP and reminders will reach you automatically')}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12, paddingBottom: 30 }}>
        {data.events.map((ev) => {
          const r = !!s.rsvp[ev.id];
          const tn = tone(ev.tone);
          const doRsvp = () => {
            update((p) => ({ rsvp: { ...p.rsvp, [ev.id]: !r } }));
            toast(r ? { ar: 'أُلغي تسجيلك', en: 'Your registration was cancelled' } : { ar: 'سُجّل حضورك — أُضيف تذكير قبل الفعالية', en: 'You’re registered — a reminder was added before the event' });
          };
          return (
            <div key={ev.id} style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 15px' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 50, flex: 'none', borderRadius: 13, background: 'var(--bg)', border: '1px solid var(--bd)', padding: '7px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1 }}>{ev.d}</div>
                  <div style={{ fontSize: 9, color: 'var(--sub)', marginTop: 3 }}>{t(ev.m)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: tn.c, background: tn.bg, borderRadius: 6, padding: '2.5px 8px' }}>{t(ev.kind)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4, lineHeight: 1.5 }}>{t(ev.t)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 2 }}>{t(ev.by)} · {t(ev.going)}</div>
                </div>
              </div>
              <span onClick={doRsvp} style={{ cursor: 'pointer', display: 'flex', marginTop: 11, height: 40, borderRadius: 11, background: r ? 'var(--grnT)' : 'var(--pri)', color: r ? 'var(--grnTx)' : 'var(--onPri)', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'all .2s' }}>{r ? tt('✓ مسجل — سيصلك تذكير', '✓ Registered — you’ll get a reminder') : tt('تسجيل حضور', 'RSVP')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
