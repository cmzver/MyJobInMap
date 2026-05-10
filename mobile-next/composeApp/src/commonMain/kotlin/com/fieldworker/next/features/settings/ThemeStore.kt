package com.fieldworker.next.features.settings

interface ThemeStore {
    fun read(): ThemeMode
    fun write(mode: ThemeMode)
}

class InMemoryThemeStore : ThemeStore {
    private var mode = ThemeMode.SYSTEM
    override fun read() = mode
    override fun write(mode: ThemeMode) { this.mode = mode }
}
