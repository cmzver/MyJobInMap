import { useState, useEffect } from 'react'

type Theme = 'light' | 'dark' | 'system' | 'modern' | 'mac' | 'aurora'
const SUPPORTED_THEMES = new Set<Theme>(['light', 'dark', 'system', 'modern', 'mac', 'aurora'])

function normalizeStoredTheme(value: string | null): Theme {
  if (value && SUPPORTED_THEMES.has(value as Theme)) {
    return value as Theme
  }
  return 'system'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return normalizeStoredTheme(localStorage.getItem('theme'))
    }
    return 'system'
  })

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const root = window.document.documentElement
    const THEME_CLASSES = ['light', 'dark', 'theme-modern', 'theme-mac', 'theme-aurora']

    const applyTheme = (newTheme: Theme) => {
      root.classList.remove(...THEME_CLASSES)

      if (newTheme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        root.classList.add(systemTheme)
        setResolvedTheme(systemTheme)
        return
      }

      if (newTheme === 'modern') {
        root.classList.add('theme-modern')
        setResolvedTheme('light')
        return
      }

      if (newTheme === 'mac') {
        root.classList.add('theme-mac')
        setResolvedTheme('light')
        return
      }

      if (newTheme === 'aurora') {
        root.classList.add('theme-aurora')
        setResolvedTheme('dark')
        return
      }

      root.classList.add(newTheme)
      setResolvedTheme(newTheme)
    }

    applyTheme(theme)

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light')
      }
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  const setThemeAndStore = (newTheme: Theme) => {
    const normalizedTheme = normalizeStoredTheme(newTheme)
    localStorage.setItem('theme', normalizedTheme)
    setTheme(normalizedTheme)
  }

  return {
    theme,
    resolvedTheme,
    setTheme: setThemeAndStore,
    isDark: resolvedTheme === 'dark',
  }
}
