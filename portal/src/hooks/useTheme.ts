import { useState, useEffect } from 'react'

type Theme = 'light' | 'dark' | 'system' | 'modern' | 'mac' | 'aurora'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as Theme) || 'system'
    }
    return 'system'
  })

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const root = window.document.documentElement
    const THEME_CLASSES = ['light', 'dark', 'theme-modern', 'theme-mac', 'theme-aurora']

    const applyTheme = (newTheme: Theme) => {
      root.classList.remove(...THEME_CLASSES)

      if (newTheme === 'modern') {
        root.classList.add('light', 'theme-modern')
        setResolvedTheme('light')
        return
      }

      if (newTheme === 'mac') {
        root.classList.add('light', 'theme-mac')
        setResolvedTheme('light')
        return
      }

      if (newTheme === 'aurora') {
        root.classList.add('dark', 'theme-aurora')
        setResolvedTheme('dark')
        return
      }

      if (newTheme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        root.classList.add(systemTheme)
        setResolvedTheme(systemTheme)
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
    localStorage.setItem('theme', newTheme)
    setTheme(newTheme)
  }

  return {
    theme,
    resolvedTheme,
    setTheme: setThemeAndStore,
    isDark: resolvedTheme === 'dark',
  }
}
