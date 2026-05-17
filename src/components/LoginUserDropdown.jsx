import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../App.jsx';

// Searchable user picker. Renders a single trigger button; tapping it opens
// a filterable list below (or above, if there isn't enough room).
//
// Items are { id, full_name, email } — anything else is ignored.
export default function LoginUserDropdown({
  users,
  loading,
  selected,
  onSelect,
}) {
  const { tr } = useLang();
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [openDirection, setOpenDirection] = useState('down');

  // Disambiguate duplicate display names by appending the email.
  const display = useMemo(() => {
    const seen = new Map();
    for (const u of users || []) {
      const key = (u.full_name || '').trim().toLowerCase();
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    return (users || []).map((u) => {
      const dup = seen.get((u.full_name || '').trim().toLowerCase()) > 1;
      return {
        ...u,
        label: dup ? `${u.full_name} (${u.email})` : u.full_name,
      };
    });
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return display;
    return display.filter(
      (u) =>
        u.label.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q),
    );
  }, [display, query]);

  // Position the dropdown above the trigger if there isn't 280px of room below.
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenDirection(spaceBelow < 280 ? 'up' : 'down');
  }, [open]);

  // Reset highlight on filter change.
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // Focus the search input when opening.
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  // Keep highlight in view while arrow-keying.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector('[data-highlighted="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const choose = (u) => {
    onSelect(u);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      if (filtered[highlight]) {
        e.preventDefault();
        choose(filtered[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-start input-field flex items-center justify-between gap-2 h-auto py-2.5"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading}
      >
        <span className="flex-1 min-w-0">
          {loading ? (
            <span className="text-gray-400">{tr.loadingUsers}</span>
          ) : selected ? (
            <>
              <span className="block text-sm font-semibold text-gray-900 truncate">
                {selected.full_name}
              </span>
              <span className="block text-[11px] text-gray-500 truncate" dir="ltr">
                {selected.email}
              </span>
            </>
          ) : (
            <span className="text-gray-400">{tr.pickYourName}</span>
          )}
        </span>
        <span aria-hidden className="text-gray-400 text-xs shrink-0">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className={`absolute z-30 left-0 right-0 ${
            openDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          } card shadow-xl overflow-hidden fade-in`}
          role="listbox"
        >
          <div className="p-2 border-b border-gray-100 bg-white sticky top-0">
            <input
              ref={searchRef}
              type="text"
              className="input-field text-base"
              style={{ fontSize: '16px' }}
              placeholder={tr.searchByName}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>

          <div
            ref={listRef}
            className="max-h-64 overflow-y-auto overscroll-contain"
          >
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                <p className="text-2xl mb-1">🔍</p>
                {tr.noUserFound}
              </div>
            ) : (
              filtered.map((u, i) => {
                const active = i === highlight;
                return (
                  <button
                    key={u.id}
                    type="button"
                    data-highlighted={active}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(u)}
                    className={`w-full text-start px-4 py-3 transition flex flex-col gap-0.5 ${
                      active ? 'bg-roshen-50' : 'hover:bg-gray-50'
                    }`}
                    style={{ minHeight: '44px' }}
                  >
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {u.label}
                    </span>
                    {/* Email line only when label doesn't already include it */}
                    {!u.label.includes('(') && (
                      <span className="text-[11px] text-gray-500 truncate" dir="ltr">
                        {u.email}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
