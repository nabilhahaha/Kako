'use client';
import { CSSProperties, ReactNode } from 'react';
import { scoreRing, scoreCol } from '@/lib/tokens';

/* ---------------- Icon set (paths ported from the design SVGs) ---------------- */
type IconName =
  | 'back' | 'chevronDown' | 'search' | 'bell' | 'phone' | 'chat' | 'chatLines'
  | 'camera' | 'check' | 'clock' | 'face' | 'plus' | 'mic' | 'image' | 'pin'
  | 'nav' | 'star' | 'shield' | 'edit' | 'settings' | 'logout' | 'briefcase' | 'users' | 'home' | 'grid';

const P: Record<IconName, ReactNode> = {
  back: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2 2 0 0 0 4 0" /></>,
  phone: <path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  chat: <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" />,
  chatLines: <><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" /><path d="M8.5 10.5h7M8.5 13.5h4" /></>,
  camera: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><circle cx="12" cy="13" r="3.5" /><path d="M8.5 7 10 4h4l1.5 3" /></>,
  check: <path d="m5 12 5 5L20 7" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  face: <><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M9 10v1M15 10v1M9.5 15a3.5 3.5 0 0 0 5 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.8" /><path d="m4 18 5-5 4 4 3-3 4 4" /></>,
  pin: <><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  nav: <path d="M3 11 21 3l-8 18-2-7-8-3z" />,
  star: <path d="m12 3 2.6 5.7 6.2.6-4.7 4.1 1.4 6-5.5-3.2L6 19.5l1.4-6L2.7 9.4l6.2-.6L12 3z" />,
  shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L4.6 11a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 2.6h4l.4-2.6a8 8 0 0 0 1.7-1l2.4 1 2-3.4L19.4 13z" /></>,
  logout: <><path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" /><path d="M18 15l3-3-3-3M9 12h12" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 5.5a3 3 0 0 1 0 5.5M18 20c0-2.5-1-4-3-4.7" /></>,
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
};

export function Icon({
  name, size = 18, stroke = 'currentColor', sw = 1.8, fill = 'none', style,
}: { name: IconName; size?: number; stroke?: string; sw?: number; fill?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true" focusable="false">
      {P[name]}
    </svg>
  );
}

/* ---------------- Score ring ---------------- */
export function ScoreRing({
  score, size = 48, inner = 38, fontSize = 14, pop = true,
}: { score: number; size?: number; inner?: number; fontSize?: number; pop?: boolean }) {
  return (
    <div style={{
      width: size, height: size, flex: 'none', borderRadius: '50%', background: scoreRing(score),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: pop ? 'ringPop .4s cubic-bezier(.22,1,.36,1) both' : undefined,
    }}>
      <div style={{ width: inner, height: inner, borderRadius: '50%', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize, fontWeight: 700, color: scoreCol(score) }}>{score}</span>
      </div>
    </div>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({
  ini, bg, size = 40, fontSize = 13, onClick, style,
}: { ini: string; bg: string; size?: number; fontSize?: number; onClick?: () => void; style?: CSSProperties }) {
  return (
    <div onClick={onClick} style={{
      width: size, height: size, flex: 'none', borderRadius: '50%', background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, fontWeight: 700,
      cursor: onClick ? 'pointer' : undefined, ...style,
    }}>{ini}</div>
  );
}

/* ---------------- Toggle switch ---------------- */
export function Toggle({
  on, onToggle, onColor = 'var(--pri)', label,
}: { on: boolean; onToggle: () => void; onColor?: string; label?: string }) {
  return (
    <div
      role="switch"
      aria-checked={on}
      aria-label={label}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      style={{
        cursor: 'pointer', width: 44, height: 26, borderRadius: 99, flex: 'none',
        background: on ? onColor : 'var(--dv)', position: 'relative', transition: 'background .2s',
      }}>
      <span style={{
        position: 'absolute', top: 3, insetInlineStart: 3, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'transform .2s',
        transform: on ? 'translateX(-18px)' : 'translateX(0)',
      }} />
    </div>
  );
}

/* ---------------- Skeleton fallback (for lazy screens) ---------------- */
export function ScreenSkeleton() {
  const bar = (w: string, h = 14) => ({
    height: h, width: w, borderRadius: 8,
    background: 'linear-gradient(90deg,var(--dv) 25%,var(--chip) 50%,var(--dv) 75%)',
    backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite',
  });
  return (
    <div data-scroll="true" role="status" aria-busy="true" aria-label="Loading" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ ...bar('44px', 44), borderRadius: '50%' }} />
        <span style={bar('55%')} />
      </div>
      {[0, 1, 2].map((k) => (
        <div key={k} style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 18, padding: 16, marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ ...bar('54px', 54), borderRadius: 14 }} />
            <span style={bar('60%')} />
          </div>
          <span style={{ ...bar('80%', 11), display: 'block', marginTop: 14 }} />
          <span style={{ ...bar('45%', 11), display: 'block', marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

/* ---------------- Tone chip ---------------- */
export function Chip({
  children, bg, color, dot, style,
}: { children: ReactNode; bg: string; color: string; dot?: string; style?: CSSProperties }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
      color, background: bg, borderRadius: 8, padding: '5px 9px', ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />}
      {children}
    </span>
  );
}
