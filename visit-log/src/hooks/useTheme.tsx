import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'vl-theme'

interface ThemeContextValue {
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(preference: ThemePreference) {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preference === 'dark' || (preference === 'system' && systemDark)
  document.documentElement.classList.toggle('dark', dark)
  const meta = document.querySelector('meta[name="theme-color"]:not([media])')
  if (meta) meta.setAttribute('content', dark ? '#000000' : '#F2F2F7')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  })

  useEffect(() => {
    applyTheme(preference)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(preference)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = (next: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, next)
    setPreferenceState(next)
  }

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
