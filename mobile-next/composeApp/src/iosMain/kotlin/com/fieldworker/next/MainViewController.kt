package com.fieldworker.next

import androidx.compose.ui.window.ComposeUIViewController
import com.fieldworker.next.features.settings.NSUserDefaultsThemeStore

fun MainViewController() = ComposeUIViewController {
    App(themeStore = NSUserDefaultsThemeStore())
}
