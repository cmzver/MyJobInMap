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

// Базовая палитра: нейтральные поверхности + оранжевый акцент (как в портале).
object AppColors {
    // Оранжевый акцент портала (tailwind primary: 500 #ff9800, 600 #fb8c00, 700 #f57c00).
    val Primary = Color(0xFFF57C00)
    val PrimaryLight = Color(0xFFFFB74D)
    val PrimaryDark = Color(0xFFE65100)
    // Светлая подложка активного пункта (portal primary-50).
    val PrimaryContainerLight = Color(0xFFFFF3E0)
    // Тёмная тема: оранжевые подложки на почти чёрном фоне читаются как
    // коричневый — контейнер акцента там нейтрально-тёплый.
    val PrimaryContainerDark = Color(0xFF2E2A26)

    // Оранжевый для текста-ссылки на светлом фоне: бренд #F57C00 даёт 2.7:1
    // (WCAG AA — 4.5:1), на улице такой текст не читается. Тот же оттенок,
    // темнее: 4.6:1. Заливки кнопок остаются брендовыми.
    val AccentText = Color(0xFFC25400)

    val Emergency = Color(0xFFC94F4F)
    val EmergencyBg = Color(0xFFFCECEC)
    val Urgent = Color(0xFFCC7A1A)
    val UrgentBg = Color(0xFFFFF2E2)
    val Current = Color(0xFF2A6F97)
    val CurrentBg = Color(0xFFEAF3F8)
    val Planned = Color(0xFF2F7D4B)
    val PlannedBg = Color(0xFFEAF6EC)

    // Цвет несёт СТАТУС (единственный источник — ui/utils/TaskColors.kt).
    // Красный зарезервирован за аварийным приоритетом, поэтому «Новая» — синяя.
    val StatusNew = Color(0xFF2563EB)
    val StatusInProgress = Color(0xFFD97706)
    val StatusDone = Color(0xFF16A34A)
    val StatusCancelled = Color(0xFF6B7280)
    val PriorityEmergency = Color(0xFFDC2626)

    // Тёмная тема: те же оттенки на шаг светлее (шкала 400) — тёмный фон
    // съедает контраст базовых (600), «Новая» синим почти не читалась.
    val StatusNewDark = Color(0xFF60A5FA)
    val StatusInProgressDark = Color(0xFFFBBF24)
    val StatusDoneDark = Color(0xFF4ADE80)
    val StatusCancelledDark = Color(0xFF9CA3AF)

    // Текст статуса на светлом чипе — на ступень темнее точки (шкала 700):
    // 600-е оттенки давали 2.8:1 для «В работе»/«Выполнена».
    val StatusNewText = Color(0xFF1D4ED8)
    val StatusInProgressText = Color(0xFFB45309)
    val StatusDoneText = Color(0xFF15803D)
    val StatusCancelledText = Color(0xFF4B5563)
    val PriorityEmergencyDark = Color(0xFFF87171)
    val PriorityNeutral = Color(0xFF8E8E93)

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
    onPrimary = Color(0xFF3A1D00),
    primaryContainer = AppColors.PrimaryContainerDark,
    onPrimaryContainer = AppColors.PrimaryLight,
    secondary = AppColors.Current,
    tertiary = AppColors.Planned,
    background = Color(0xFF0F1416),
    surface = Color(0xFF151D20),
    surfaceVariant = Color(0xFF243136),
    onSurface = Color(0xFFF1F4F5),
    onSurfaceVariant = Color(0xFFB6C0C4),
    error = AppColors.Error,
    // Ниже — роли, которые иначе берутся из фиолетовой baseline-палитры M3
    // (лавандовые диалоги, меню, тональные кнопки, обводки).
    secondaryContainer = Color(0xFF243136),
    onSecondaryContainer = Color(0xFFF1F4F5),
    tertiaryContainer = Color(0xFF1E3A2A),
    onTertiaryContainer = Color(0xFFBDE5C8),
    errorContainer = Color(0xFF3B1F1F),
    onErrorContainer = Color(0xFFF2B8B5),
    surfaceTint = AppColors.PrimaryLight,
    outline = Color(0xFF6E7B81),
    outlineVariant = Color(0xFF34434A),
    surfaceContainerLowest = Color(0xFF0B1012),
    surfaceContainerLow = Color(0xFF131A1D),
    surfaceContainer = Color(0xFF182124),
    surfaceContainerHigh = Color(0xFF1E282C),
    surfaceContainerHighest = Color(0xFF253136),
)

private val LightColorScheme = lightColorScheme(
    primary = AppColors.Primary,
    onPrimary = Color.White,
    primaryContainer = AppColors.PrimaryContainerLight,
    onPrimaryContainer = AppColors.PrimaryDark,
    secondary = AppColors.Current,
    tertiary = AppColors.Planned,
    background = AppColors.Background,
    surface = AppColors.Surface,
    surfaceVariant = AppColors.SurfaceVariant,
    onSurface = AppColors.OnSurface,
    onSurfaceVariant = AppColors.OnSurfaceVariant,
    error = AppColors.Error,
    // Ниже — роли, которые иначе берутся из фиолетовой baseline-палитры M3
    // (лавандовые диалоги, меню, тональные кнопки, обводки).
    secondaryContainer = Color(0xFFEDF0F1),
    onSecondaryContainer = AppColors.OnSurface,
    tertiaryContainer = AppColors.PlannedBg,
    onTertiaryContainer = AppColors.Planned,
    errorContainer = AppColors.EmergencyBg,
    onErrorContainer = Color(0xFF8A1C1C),
    surfaceTint = AppColors.Primary,
    outline = Color(0xFF8A959B),
    outlineVariant = Color(0xFFDDE2E4),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFAFBF9),
    surfaceContainer = Color(0xFFF3F5F2),
    surfaceContainerHigh = Color(0xFFFFFFFF),
    surfaceContainerHighest = Color(0xFFE9ECEC),
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

