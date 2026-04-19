package com.fieldworker.next

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.fieldworker.next.core.designsystem.PortalNextTheme
import com.fieldworker.next.data.push.PushTokenProvider
import com.fieldworker.next.data.remote.store.PortalSessionStore
import com.fieldworker.next.di.appModules
import com.fieldworker.next.features.settings.ThemeManager
import com.fieldworker.next.features.settings.ThemeMode
import org.koin.compose.KoinApplication
import org.koin.compose.koinInject

@Composable
fun App(
    sessionStore: PortalSessionStore? = null,
    pushTokenProvider: PushTokenProvider? = null,
) {
    KoinApplication(application = {
        modules(
            if (sessionStore != null) appModules(sessionStore, pushTokenProvider)
            else appModules,
        )
    }) {
        val themeManager = koinInject<ThemeManager>()
        val themeMode by themeManager.themeMode.collectAsState()
        val isDark = when (themeMode) {
            ThemeMode.SYSTEM -> isSystemInDarkTheme()
            ThemeMode.LIGHT -> false
            ThemeMode.DARK -> true
        }
        PortalNextTheme(darkTheme = isDark) {
            AppShell()
        }
    }
}
