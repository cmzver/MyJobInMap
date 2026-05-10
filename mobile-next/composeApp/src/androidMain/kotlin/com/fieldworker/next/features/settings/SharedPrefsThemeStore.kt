package com.fieldworker.next.features.settings

import android.content.Context

class SharedPrefsThemeStore(context: Context) : ThemeStore {
    private val prefs = context.getSharedPreferences("app_appearance", Context.MODE_PRIVATE)

    override fun read(): ThemeMode {
        return when (prefs.getString(KEY_THEME, ThemeMode.SYSTEM.name)) {
            ThemeMode.LIGHT.name -> ThemeMode.LIGHT
            ThemeMode.DARK.name -> ThemeMode.DARK
            else -> ThemeMode.SYSTEM
        }
    }

    override fun write(mode: ThemeMode) {
        prefs.edit().putString(KEY_THEME, mode.name).apply()
    }

    private companion object {
        const val KEY_THEME = "theme_mode"
    }
}
