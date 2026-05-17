import { ACTION_CODES, ACTION_LABELS, ACTION_COLORS, ACTION_ICONS } from '../lib/actions.js';
import { useLang } from '../App.jsx';

export default function ActionSelector({ value, onChange, exclude = [], disabled = false }) {
  const { lang } = useLang();
  const codes = ACTION_CODES.filter((c) => !exclude.includes(c));

  return (
    <div className="grid grid-cols-1 gap-2">
      {codes.map((code) => {
        const selected = value === code;
        const c = ACTION_COLORS[code];
        return (
          <button
            key={code}
            type="button"
            disabled={disabled}
            onClick={() => onChange(code)}
            className="flex items-center gap-3 rounded-input border-2 px-3 py-3 transition active:scale-[0.99] disabled:opacity-50"
            style={{
              background: selected ? c.bg : '#ffffff',
              borderColor: selected ? c.border : '#e5e7eb',
            }}
          >
            <span
              className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
              style={{
                borderColor: selected ? c.fg : '#9ca3af',
                background: selected ? c.fg : 'white',
              }}
              aria-hidden
            >
              {selected && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <span className="text-xl shrink-0" aria-hidden>
              {ACTION_ICONS[code]}
            </span>
            <span className="text-sm font-semibold text-start flex-1" style={{ color: c.fg }}>
              {ACTION_LABELS[code][lang]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
