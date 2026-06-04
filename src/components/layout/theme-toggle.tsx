'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';

/** Light/dark toggle. The initial class is applied pre-paint by the inline
 *  script in the root layout; this just flips it and persists the choice. */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('ams-theme', next ? 'dark' : 'light');
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    setDark(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={t('common.toggleTheme')}
      title={t('common.toggleTheme')}
      className={
        'flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary ' +
        (className ?? '')
      }
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
