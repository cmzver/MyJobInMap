package com.fieldworker.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

/**
 * Круглая плавающая кнопка-действие: белая плашка с обводкой и значком цвета
 * акцента; [isActive] — включённый режим (заливка акцентом). Один вид для
 * кнопок карты и «наверх/вниз» в ленте и чате — вместо залитых FAB.
 */
@Composable
fun RoundActionButton(
    onClick: () -> Unit,
    icon: ImageVector,
    contentDescription: String,
    modifier: Modifier = Modifier,
    isActive: Boolean = false,
) {
    // key: при смене состояния поверх карты (AndroidView) слой с тенью не
    // перерисовывал фон — кнопка становилась белой с белым значком
    key(isActive) {
        Surface(
            modifier = modifier.size(48.dp),
            shape = CircleShape,
            color = if (isActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
            contentColor = if (isActive) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary,
            tonalElevation = 0.dp,
            shadowElevation = 6.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            IconButton(onClick = onClick) {
                Icon(
                    imageVector = icon,
                    contentDescription = contentDescription,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
    }
}
