package com.fieldworker.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.text.style.TextOverflow
import com.fieldworker.ui.theme.AppShape
import com.fieldworker.ui.utils.accentTextColor

/**
 * Взаимоисключающий выбор из 2–3 коротких вариантов — сегменты на всю ширину.
 * Цвета как у [QuickFilterChip]: выбранный — лёгкая подложка акцента и
 * текст-ссылка, остальные — нейтральные. Для длинных подписей и 4+ вариантов
 * сегменты не помещаются — там [QuickFilterChip] в FlowRow.
 */
@Composable
fun <T> SegmentedChoice(
    options: List<T>,
    selected: T,
    onSelect: (T) -> Unit,
    label: (T) -> String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val surface = MaterialTheme.colorScheme.surface
    val colors = SegmentedButtonDefaults.colors(
        activeContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f).compositeOver(surface),
        activeContentColor = accentTextColor(),
        activeBorderColor = MaterialTheme.colorScheme.outlineVariant,
        inactiveContainerColor = surface,
        inactiveContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        inactiveBorderColor = MaterialTheme.colorScheme.outlineVariant,
    )
    SingleChoiceSegmentedButtonRow(modifier = modifier.fillMaxWidth()) {
        options.forEachIndexed { index, option ->
            SegmentedButton(
                selected = option == selected,
                onClick = { onSelect(option) },
                shape = SegmentedButtonDefaults.itemShape(index = index, count = options.size, baseShape = AppShape.md),
                enabled = enabled,
                colors = colors,
                label = { Text(label(option), maxLines = 1, overflow = TextOverflow.Ellipsis) },
            )
        }
    }
}
