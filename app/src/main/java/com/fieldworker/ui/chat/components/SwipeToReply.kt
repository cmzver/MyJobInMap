package com.fieldworker.ui.chat.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import kotlinx.coroutines.launch

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
    val offsetX = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    var triggered by remember { mutableStateOf(false) }

    pointerInput(enabled) {
        if (!enabled) return@pointerInput
        detectHorizontalDragGestures(
            onHorizontalDrag = { _, dragAmount ->
                val next = (offsetX.value + dragAmount).coerceIn(0f, threshold * 1.35f)
                scope.launch {
                    offsetX.snapTo(next)
                }
                onProgressChanged((next / threshold).coerceIn(0f, 1f))
                if (!triggered && next > threshold) {
                    haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
                    triggered = true
                }
            },
            onDragEnd = {
                if (offsetX.value > threshold) {
                    onReply()
                }
                triggered = false
                onProgressChanged(0f)
                scope.launch {
                    offsetX.animateTo(0f, animationSpec = tween(220))
                }
            },
            onDragCancel = {
                triggered = false
                onProgressChanged(0f)
                scope.launch {
                    offsetX.animateTo(0f, animationSpec = tween(220))
                }
            }
        )
    }
    .graphicsLayer { translationX = offsetX.value }
    .alpha(1f - (offsetX.value / (threshold * 2)).coerceIn(0f, 0.3f))
}
