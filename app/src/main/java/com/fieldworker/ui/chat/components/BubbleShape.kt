package com.fieldworker.ui.chat.components

import androidx.compose.foundation.shape.GenericShape
import kotlin.math.min

/**
 * Telegram-style bubble shape с хвостиком.
 * @param isOwn true — свой, хвостик справа; false — чужой, хвостик слева
 * @param groupedWithNext true — не рисовать хвостик
 */
fun BubbleShape(isOwn: Boolean, groupedWithNext: Boolean) = GenericShape { size, _ ->
    val radius = min(size.width, size.height) * 0.22f
    val tailSize = radius * 0.8f
    val tailHeight = radius * 0.7f
    val tailOffset = radius * 0.45f
    val w = size.width
    val h = size.height

    if (isOwn) {
        // Свой: хвостик справа
        moveTo(radius, 0f)
        lineTo(w - radius, 0f)
        quadraticTo(w, 0f, w, radius)
        lineTo(w, h - radius - if (!groupedWithNext) tailHeight else 0f)
        quadraticTo(w, h, w - radius, h)
        // Хвостик
        if (!groupedWithNext) {
            lineTo(w - tailOffset, h)
            lineTo(w, h + tailHeight)
            lineTo(w - tailSize, h)
        }
        lineTo(radius, h)
        quadraticTo(0f, h, 0f, h - radius)
        lineTo(0f, radius)
        quadraticTo(0f, 0f, radius, 0f)
        close()
    } else {
        // Чужой: хвостик слева
        moveTo(radius, 0f)
        lineTo(w - radius, 0f)
        quadraticTo(w, 0f, w, radius)
        lineTo(w, h - radius)
        quadraticTo(w, h, w - radius, h)
        lineTo(tailSize, h)
        if (!groupedWithNext) {
            lineTo(tailOffset, h)
            lineTo(0f, h + tailHeight)
            lineTo(0f, h)
        }
        lineTo(radius, h)
        quadraticTo(0f, h, 0f, h - radius)
        lineTo(0f, radius)
        quadraticTo(0f, 0f, radius, 0f)
        close()
    }
}
