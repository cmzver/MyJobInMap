package com.fieldworker.next.features.settings

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class ThemeManager(private val store: ThemeStore) {
    private val _themeMode = MutableStateFlow(store.read())
    val themeMode: StateFlow<ThemeMode> = _themeMode.asStateFlow()

    fun setTheme(mode: ThemeMode) {
        store.write(mode)
        _themeMode.value = mode
    }
}
