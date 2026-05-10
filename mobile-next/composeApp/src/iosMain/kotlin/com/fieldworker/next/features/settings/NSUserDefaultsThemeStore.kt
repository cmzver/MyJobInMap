package com.fieldworker.next.features.settings

import platform.Foundation.NSUserDefaults

class NSUserDefaultsThemeStore : ThemeStore {
    private val defaults = NSUserDefaults.standardUserDefaults

    override fun read(): ThemeMode {
        return when (defaults.stringForKey(KEY_THEME)) {
            ThemeMode.LIGHT.name -> ThemeMode.LIGHT
            ThemeMode.DARK.name -> ThemeMode.DARK
            else -> ThemeMode.SYSTEM
        }
    }

    override fun write(mode: ThemeMode) {
        defaults.setObject(mode.name, KEY_THEME)
    }

    private companion object {
        const val KEY_THEME = "theme_mode"
    }
}
