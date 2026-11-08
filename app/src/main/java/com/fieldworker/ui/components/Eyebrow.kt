package com.fieldworker.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Eyebrow — мелкий приглушённый заголовок секции или подпись над значением
 * (как в портале). Нейтральный: акцент в интерфейсе — только для действий.
 * Единственная реализация — раньше в экранах жило восемь копий с разным
 * межбуквенным интервалом и насыщенностью.
 */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        modifier = modifier,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.8.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
