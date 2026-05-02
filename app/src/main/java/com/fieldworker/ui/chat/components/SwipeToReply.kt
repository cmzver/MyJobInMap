package com.fieldworker.ui.chat.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback

/**
 * Modifier для swipe-to-reply (Telegram-style).
 * @param onReply вызывается при свайпе вправо > thresholdPx
 */
fun Modifier.swipeToReply(
    enabled: Boolean = true,
    threshold: Float = 72f,
    onProgressChanged: (Float) -> Unit = {},
    onReply: () -> Unit
): Modifier = composed {
    var offsetX by remember { mutableFloatStateOf(0f) }
    var isDragging by remember { mutableStateOf(false) }
    val haptics = LocalHapticFeedback.current
    var triggered by remember { mutableStateOf(false) }
    val animatedOffsetX by animateFloatAsState(
        targetValue = offsetX,
        animationSpec = if (isDragging) snap() else tween(220),
        label = "swipeToReplyOffset",
    )

    pointerInput(enabled) {
        if (!enabled) return@pointerInput
        detectHorizontalDragGestures(
            onHorizontalDrag = { _, dragAmount ->
                isDragging = true
                val next = (offsetX + dragAmount).coerceIn(0f, threshold * 1.35f)
                offsetX = next
                onProgressChanged((next / threshold).coerceIn(0f, 1f))
                if (!triggered && next > threshold) {
                    haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
                    triggered = true
                }
            },
            onDragEnd = {
                if (offsetX > threshold) {
                    onReply()
                }
                isDragging = false
                triggered = false
                onProgressChanged(0f)
                offsetX = 0f
            },
            onDragCancel = {
                isDragging = false
                triggered = false
                onProgressChanged(0f)
                offsetX = 0f
            }
        )
    }
    .graphicsLayer { translationX = animatedOffsetX }
    .alpha(1f - (animatedOffsetX / (threshold * 2)).coerceIn(0f, 0.3f))
}
