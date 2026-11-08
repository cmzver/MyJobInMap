package com.fieldworker.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * Иконка-воронка «фильтр» (официальный Material path). Определена локально, чтобы
 * не тянуть весь material-icons-extended ради одного значка.
 */
val FilterFunnelIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "FilterList",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(10f, 18f); horizontalLineToRelative(4f); verticalLineToRelative(-2f)
            horizontalLineToRelative(-4f); close()
            moveTo(3f, 6f); verticalLineToRelative(2f); horizontalLineToRelative(18f)
            verticalLineTo(6f); horizontalLineTo(3f); close()
            moveTo(6f, 13f); horizontalLineToRelative(12f); verticalLineToRelative(-2f)
            horizontalLineTo(6f); close()
        }
    }.build()
}
