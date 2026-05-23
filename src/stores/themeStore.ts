import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeStore {
  theme: Theme;
  toggle: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => {
  // Read from localStorage on init
  const saved = typeof window !== 'undefined' ? localStorage.getItem('roshen_theme') as Theme : null;
  const initial = saved === 'dark' ? 'dark' : 'light';

  // Apply immediately
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }

  return {
    theme: initial,
    toggle: () => {
      const next = get().theme === 'light' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', next === 'dark');
      localStorage.setItem('roshen_theme', next);
      set({ theme: next });
    },
  };
});
