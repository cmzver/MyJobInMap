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

// Основные цвета приложения (на основе референса)
object AppColors {
    // iOS-inspired primary
    val Primary = Color(0xFF007AFF)
    val PrimaryLight = Color(0xFF4DA3FF)
    val PrimaryDark = Color(0xFF005BBB)

    // Priority colors
    val Emergency = Color(0xFFFF3B30)
    val EmergencyBg = Color(0xFFFFEBEE)
    val Urgent = Color(0xFFFF9500)
    val UrgentBg = Color(0xFFFFF3E0)
    val Current = Color(0xFF0A84FF)
    val CurrentBg = Color(0xFFE3F2FD)
    val Planned = Color(0xFF34C759)
    val PlannedBg = Color(0xFFE8F5E9)

    // Status colors
    val StatusNew = Color(0xFFFF3B30)
    val StatusInProgress = Color(0xFFFF9500)
    val StatusDone = Color(0xFF34C759)
    val StatusCancelled = Color(0xFF8E8E93)

    // Base surfaces
    val Background = Color(0xFFF2F2F7)
    val Surface = Color(0xFFFFFFFF)
    val SurfaceVariant = Color(0xFFE5E5EA)

    // Text
    val OnSurface = Color(0xFF1C1C1E)
    val OnSurfaceVariant = Color(0xFF636366)

    // Feedback
    val Success = Color(0xFF34C759)
    val Error = Color(0xFFFF3B30)
    val Warning = Color(0xFFFF9500)
}

private val DarkColorScheme = darkColorScheme(
    primary = AppColors.PrimaryLight,
    onPrimary = Color.White,
    primaryContainer = AppColors.PrimaryDark,
    secondary = AppColors.Current,
    tertiary = AppColors.Planned,
    background = Color(0xFF000000),
    surface = Color(0xFF1C1C1E),
    surfaceVariant = Color(0xFF2C2C2E),
    onSurface = Color(0xFFF2F2F7),
    onSurfaceVariant = Color(0xFFB0B0B5),
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
            // Светлый статус бар для светлой темы
            window.statusBarColor = if (darkTheme) {
                colorScheme.surface.toArgb()
            } else {
                colorScheme.background.toArgb()
            }
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        shapes = Shapes,
        content = content
    )
}

