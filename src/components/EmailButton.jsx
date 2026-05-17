import { useState } from 'react';
import { useLang } from '../App.jsx';
import EmailModal from './EmailModal.jsx';

export default function EmailButton({
  visit,
  items, // optional — modal will lazy-load if not provided
  size = 'sm',
  variant = 'secondary',
  stop = true,
  fullWidth = false,
}) {
  const { tr } = useLang();
  const [open, setOpen] = useState(false);

  const onClick = (e) => {
    if (stop) {
      e.preventDefault();
      e.stopPropagation();
    }
    setOpen(true);
  };

  const sizeCls =
    size === 'lg' ? 'text-sm px-4 py-3'
    : size === 'md' ? 'text-sm px-3 py-2'
    : 'text-xs px-2.5 py-1';

  const variantCls =
    variant === 'primary'
      ? 'bg-roshen-600 text-white hover:bg-roshen-700'
      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50';

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center justify-center gap-1.5 rounded-input font-semibold transition active:scale-[0.98] ${fullWidth ? 'w-full' : ''} ${sizeCls} ${variantCls}`}
        title={tr.emailLabel}
      >
        <span aria-hidden>✉️</span>
        <span className="whitespace-nowrap">{tr.emailLabel}</span>
      </button>
      {open && (
        <EmailModal
          visit={visit}
          items={items}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
