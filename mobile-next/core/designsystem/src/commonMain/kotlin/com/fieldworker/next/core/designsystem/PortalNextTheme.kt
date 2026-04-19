package com.fieldworker.next.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ── Brand colors ────────────────────────────────────────────────
object FwColors {
    // Primary — vibrant blue (Telegram-style)
    val Blue50 = Color(0xFFEFF6FF)
    val Blue100 = Color(0xFFDBEAFE)
    val Blue200 = Color(0xFFBFDBFE)
    val Blue400 = Color(0xFF60A5FA)
    val Blue500 = Color(0xFF3B82F6)
    val Blue600 = Color(0xFF2563EB)
    val Blue700 = Color(0xFF1D4ED8)

    // Accent — teal
    val Teal400 = Color(0xFF2DD4BF)
    val Teal500 = Color(0xFF14B8A6)
    val Teal600 = Color(0xFF0D9488)

    // Success — green
    val Green50 = Color(0xFFF0FDF4)
    val Green100 = Color(0xFFDCFCE7)
    val Green500 = Color(0xFF22C55E)
    val Green600 = Color(0xFF16A34A)
    val Green700 = Color(0xFF15803D)

    // Warning — amber
    val Amber50 = Color(0xFFFFFBEB)
    val Amber100 = Color(0xFFFEF3C7)
    val Amber400 = Color(0xFFFBBF24)
    val Amber500 = Color(0xFFF59E0B)
    val Amber600 = Color(0xFFD97706)

    // Error — red
    val Red50 = Color(0xFFFEF2F2)
    val Red100 = Color(0xFFFEE2E2)
    val Red400 = Color(0xFFF87171)
    val Red500 = Color(0xFFEF4444)
    val Red600 = Color(0xFFDC2626)
    val Red700 = Color(0xFFB91C1C)

    // Neutrals
    val Slate50 = Color(0xFFF8FAFC)
    val Slate100 = Color(0xFFF1F5F9)
    val Slate200 = Color(0xFFE2E8F0)
    val Slate300 = Color(0xFFCBD5E1)
    val Slate400 = Color(0xFF94A3B8)
    val Slate500 = Color(0xFF64748B)
    val Slate600 = Color(0xFF475569)
    val Slate700 = Color(0xFF334155)
    val Slate800 = Color(0xFF1E293B)
    val Slate900 = Color(0xFF0F172A)
    val Slate950 = Color(0xFF020617)
}

private val LightColors = lightColorScheme(
    primary = FwColors.Blue600,
    onPrimary = Color.White,
    primaryContainer = FwColors.Blue50,
    onPrimaryContainer = FwColors.Blue700,
    secondary = FwColors.Teal600,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE0F7F4),
    onSecondaryContainer = Color(0xFF0D4F47),
    tertiary = FwColors.Amber600,
    onTertiary = Color.White,
    tertiaryContainer = FwColors.Amber50,
    onTertiaryContainer = Color(0xFF5C3D00),
    background = FwColors.Slate50,
    onBackground = FwColors.Slate900,
    surface = Color.White,
    onSurface = FwColors.Slate900,
    surfaceVariant = FwColors.Slate100,
    onSurfaceVariant = FwColors.Slate500,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = FwColors.Slate50,
    surfaceContainer = FwColors.Slate100,
    surfaceContainerHigh = FwColors.Slate200,
    outline = FwColors.Slate300,
    outlineVariant = FwColors.Slate200,
    error = FwColors.Red600,
    onError = Color.White,
    errorContainer = FwColors.Red50,
    onErrorContainer = FwColors.Red700,
    inverseSurface = FwColors.Slate800,
    inverseOnSurface = FwColors.Slate100,
    inversePrimary = FwColors.Blue200,
    scrim = Color(0x52000000),
)

private val DarkColors = darkColorScheme(
    primary = FwColors.Blue400,
    onPrimary = Color(0xFF002B75),
    primaryContainer = Color(0xFF1A3A5C),
    onPrimaryContainer = FwColors.Blue200,
    secondary = FwColors.Teal400,
    onSecondary = Color(0xFF003731),
    secondaryContainer = Color(0xFF0A3D37),
    onSecondaryContainer = Color(0xFFA3F0E3),
    tertiary = FwColors.Amber400,
    onTertiary = Color(0xFF3E2800),
    tertiaryContainer = Color(0xFF5C3D00),
    onTertiaryContainer = FwColors.Amber100,
    background = Color(0xFF0B0F14),
    onBackground = FwColors.Slate100,
    surface = Color(0xFF111620),
    onSurface = FwColors.Slate100,
    surfaceVariant = Color(0xFF1C2433),
    onSurfaceVariant = FwColors.Slate400,
    surfaceContainerLowest = Color(0xFF080C12),
    surfaceContainerLow = Color(0xFF0F1420),
    surfaceContainer = Color(0xFF151B28),
    surfaceContainerHigh = Color(0xFF1C2433),
    outline = FwColors.Slate700,
    outlineVariant = Color(0xFF293548),
    error = FwColors.Red400,
    onError = Color(0xFF5C0D0D),
    errorContainer = Color(0xFF3B1111),
    onErrorContainer = FwColors.Red100,
    inverseSurface = FwColors.Slate200,
    inverseOnSurface = FwColors.Slate800,
    inversePrimary = FwColors.Blue600,
    scrim = Color(0x80000000),
)

// ── Extended semantic colors ────────────────────────────────────
@Immutable
data class ExtendedColors(
    val success: Color,
    val onSuccess: Color,
    val successContainer: Color,
    val warning: Color,
    val onWarning: Color,
    val warningContainer: Color,
    val info: Color,
    val onInfo: Color,
    val infoContainer: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val divider: Color,
    val shimmer: Color,
)

val LightExtended = ExtendedColors(
    success = FwColors.Green600,
    onSuccess = Color.White,
    successContainer = FwColors.Green50,
    warning = FwColors.Amber500,
    onWarning = Color.White,
    warningContainer = FwColors.Amber50,
    info = FwColors.Blue500,
    onInfo = Color.White,
    infoContainer = FwColors.Blue50,
    textPrimary = FwColors.Slate900,
    textSecondary = FwColors.Slate500,
    textTertiary = FwColors.Slate400,
    divider = FwColors.Slate200,
    shimmer = FwColors.Slate200,
)

val DarkExtended = ExtendedColors(
    success = FwColors.Green500,
    onSuccess = Color(0xFF052E16),
    successContainer = Color(0xFF0A2E1A),
    warning = FwColors.Amber400,
    onWarning = Color(0xFF3E2800),
    warningContainer = Color(0xFF3E2800),
    info = FwColors.Blue400,
    onInfo = Color(0xFF002B75),
    infoContainer = Color(0xFF0E2240),
    textPrimary = FwColors.Slate100,
    textSecondary = FwColors.Slate400,
    textTertiary = FwColors.Slate500,
    divider = Color(0xFF293548),
    shimmer = Color(0xFF1C2433),
)

val LocalExtendedColors = staticCompositionLocalOf { LightExtended }

// ── Typography ──────────────────────────────────────────────────
private val AppTypography = Typography(
    displayLarge = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 34.sp,
        lineHeight = 40.sp,
        letterSpacing = (-0.25).sp,
    ),
    displayMedium = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 34.sp,
    ),
    displaySmall = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
    ),
    headlineLarge = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        lineHeight = 28.sp,
    ),
    headlineMedium = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
    ),
    headlineSmall = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 24.sp,
    ),
    titleLarge = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 17.sp,
        lineHeight = 22.sp,
    ),
    titleMedium = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 22.sp,
        letterSpacing = 0.1.sp,
    ),
    titleSmall = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp,
    ),
    bodyLarge = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodyMedium = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    bodySmall = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp,
    ),
    labelLarge = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp,
    ),
    labelMedium = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp,
    ),
    labelSmall = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.5.sp,
    ),
)

// ── Shapes ──────────────────────────────────────────────────────
private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

// ── Theme ───────────────────────────────────────────────────────
@Composable
fun PortalNextTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    val extendedColors = if (darkTheme) DarkExtended else LightExtended

    CompositionLocalProvider(LocalExtendedColors provides extendedColors) {
        MaterialTheme(
            colorScheme = colors,
            typography = AppTypography,
            shapes = AppShapes,
            content = content,
        )
    }
}

object FwTheme {
    val extended: ExtendedColors
        @Composable get() = LocalExtendedColors.current
}
