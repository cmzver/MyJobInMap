package com.fieldworker.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// Базовая палитра: нейтральные поверхности + спокойный акцент.
object AppColors {
    val Primary = Color(0xFF16657A)
    val PrimaryLight = Color(0xFF4E8FA3)
    val PrimaryDark = Color(0xFF103F4B)

    val Emergency = Color(0xFFC94F4F)
    val EmergencyBg = Color(0xFFFCECEC)
    val Urgent = Color(0xFFCC7A1A)
    val UrgentBg = Color(0xFFFFF2E2)
    val Current = Color(0xFF2A6F97)
    val CurrentBg = Color(0xFFEAF3F8)
    val Planned = Color(0xFF2F7D4B)
    val PlannedBg = Color(0xFFEAF6EC)

    val StatusNew = Color(0xFFC94F4F)
    val StatusInProgress = Color(0xFFCC7A1A)
    val StatusDone = Color(0xFF2F7D4B)
    val StatusCancelled = Color(0xFF7B8790)

    val Background = Color(0xFFF6F7F3)
    val Surface = Color(0xFFFFFFFF)
    val SurfaceVariant = Color(0xFFE2E7E8)

    val OnSurface = Color(0xFF172026)
    val OnSurfaceVariant = Color(0xFF5A6670)

    val Success = Color(0xFF2F7D4B)
    val Error = Color(0xFFC94F4F)
    val Warning = Color(0xFFCC7A1A)
}

private val DarkColorScheme = darkColorScheme(
    primary = AppColors.PrimaryLight,
    onPrimary = Color.White,
    primaryContainer = AppColors.PrimaryDark,
    secondary = AppColors.Current,
    tertiary = AppColors.Planned,
    background = Color(0xFF0F1416),
    surface = Color(0xFF151D20),
    surfaceVariant = Color(0xFF243136),
    onSurface = Color(0xFFF1F4F5),
    onSurfaceVariant = Color(0xFFB6C0C4),
    error = AppColors.Error
)

private val LightColorScheme = lightColorScheme(
    primary = AppColors.Primary,
    onPrimary = Color.White,
    primaryContainer = AppColors.PrimaryLight.copy(alpha = 0.2f),
    secondary = AppColors.Current,
    tertiary = AppColors.Planned,
    background = AppColors.Background,
    surface = AppColors.Surface,
    surfaceVariant = AppColors.SurfaceVariant,
    onSurface = AppColors.OnSurface,
    onSurfaceVariant = AppColors.OnSurfaceVariant,
    error = AppColors.Error
)

@Composable
fun FieldWorkerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false, // Отключаем dynamic color для консистентности
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }
    
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            val systemBarColor = if (darkTheme) colorScheme.surface.toArgb() else colorScheme.background.toArgb()
            window.statusBarColor = systemBarColor
            window.navigationBarColor = colorScheme.surface.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        shapes = Shapes,
        content = content
    )
}

