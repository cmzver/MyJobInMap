package com.fieldworker.ui.chat.components

import androidx.compose.foundation.shape.GenericShape
import kotlin.math.min

/**
 * Rounded chat bubble without a tail.
 * Parameters are kept to avoid touching call sites.
 */
@Suppress("UNUSED_PARAMETER")
fun BubbleShape(isOwn: Boolean, groupedWithNext: Boolean) = GenericShape { size, _ ->
    val w = size.width
    val h = size.height
    val radius = min(w * 0.12f, h * 0.42f)
    moveTo(radius, 0f)
    lineTo(w - radius, 0f)
    quadraticTo(w, 0f, w, radius)
    lineTo(w, h - radius)
    quadraticTo(w, h, w - radius, h)
    lineTo(radius, h)
    quadraticTo(0f, h, 0f, h - radius)
    lineTo(0f, radius)
    quadraticTo(0f, 0f, radius, 0f)
    close()
}
