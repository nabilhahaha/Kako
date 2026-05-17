import { ACTION_LABELS, ACTION_COLORS, ACTION_ICONS } from '../lib/actions.js';
import { useLang } from '../App.jsx';

export default function ActionBadge({ action, size = 'md', muted = false }) {
  const { lang } = useLang();
  if (!action || !ACTION_LABELS[action]) return null;
  const label = ACTION_LABELS[action][lang];
  const c = ACTION_COLORS[action];

  const sizing =
    size === 'sm'
      ? 'text-[11px] px-2 py-0.5'
      : size === 'lg'
      ? 'text-sm px-3 py-1.5'
      : 'text-xs px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${sizing}`}
      style={{
        background: muted ? c.bg + 'aa' : c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
      }}
    >
      <span aria-hidden>{ACTION_ICONS[action]}</span>
      {label}
    </span>
  );
}
