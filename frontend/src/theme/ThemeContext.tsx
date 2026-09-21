import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'potato-theme-v2'

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

type ThemeContextValue = {
  mode: ThemeMode
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = mode
    window.localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    toggle: () => setMode((current) => current === 'light' ? 'dark' : 'light'),
  }), [mode])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
