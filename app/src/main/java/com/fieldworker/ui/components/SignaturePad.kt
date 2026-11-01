package com.fieldworker.ui.components

import android.graphics.Bitmap
import android.graphics.Paint
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.fieldworker.ui.theme.AppShape
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Точка росчерка: координаты на площадке и миллисекунды от начала подписи. */
data class SignaturePoint(val x: Float, val y: Float, val t: Long)

/**
 * Росчерки подписи. Траектория с отметками времени уходит на сервер как
 * доказательство: живую подпись так не подделать картинкой.
 */
@Stable
class SignatureState {
    val strokes = mutableStateListOf<List<SignaturePoint>>()
    val current = mutableStateListOf<SignaturePoint>()
    private var startedAt: Long? = null

    val isEmpty: Boolean
        get() = strokes.isEmpty() && current.isEmpty()

    fun begin(position: Offset, uptimeMillis: Long) {
        val start = startedAt ?: uptimeMillis.also { startedAt = it }
        current.clear()
        current.add(SignaturePoint(position.x, position.y, uptimeMillis - start))
    }

    fun extend(position: Offset, uptimeMillis: Long) {
        val start = startedAt ?: return
        current.add(SignaturePoint(position.x, position.y, uptimeMillis - start))
    }

    fun end() {
        if (current.isNotEmpty()) strokes.add(current.toList())
        current.clear()
    }

    fun clear() {
        strokes.clear()
        current.clear()
        startedAt = null
    }

    /** [[[x, y, t], ...], ...] — целые пиксели и миллисекунды. */
    fun strokesJson(): String = strokes.joinToString(",", "[", "]") { stroke ->
        stroke.joinToString(",", "[", "]") { point ->
            "[${point.x.roundToInt()},${point.y.roundToInt()},${point.t}]"
        }
    }

    /**
     * PNG подписи на прозрачном фоне, обрезанный по росчерку (не шире
     * [maxWidth]); null, если подписи нет.
     */
    fun toPng(strokeWidthPx: Float, maxWidth: Int = 800): ByteArray? {
        val points = strokes.flatten()
        if (points.isEmpty()) return null
        val pad = strokeWidthPx * 2
        val left = points.minOf { it.x } - pad
        val top = points.minOf { it.y } - pad
        val width = points.maxOf { it.x } + pad - left
        val height = points.maxOf { it.y } + pad - top
        val scale = min(1f, maxWidth / max(width, 1f))
        val bitmap = Bitmap.createBitmap(
            max(1, (width * scale).roundToInt()),
            max(1, (height * scale).roundToInt()),
            Bitmap.Config.ARGB_8888,
        )
        val canvas = android.graphics.Canvas(bitmap)
        val paint = Paint().apply {
            isAntiAlias = true
            color = android.graphics.Color.rgb(17, 24, 39)
            style = Paint.Style.STROKE
            strokeWidth = strokeWidthPx * scale
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
        strokes.forEach { stroke ->
            val path = android.graphics.Path()
            stroke.forEachIndexed { index, point ->
                val x = (point.x - left) * scale
                val y = (point.y - top) * scale
                if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            if (stroke.size == 1) {
                canvas.drawPoint((stroke[0].x - left) * scale, (stroke[0].y - top) * scale, paint)
            } else {
                canvas.drawPath(path, paint)
            }
        }
        return ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            bitmap.recycle()
            out.toByteArray()
        }
    }
}

/** Площадка для подписи пальцем. Жесты не уходят прокрутке родителя. */
@Composable
fun SignaturePad(
    state: SignatureState,
    modifier: Modifier = Modifier,
    hint: String = "Распишитесь здесь",
) {
    val ink = MaterialTheme.colorScheme.onSurface
    val guide = MaterialTheme.colorScheme.outlineVariant
    Box(
        modifier = modifier
            .clip(AppShape.md)
            .background(MaterialTheme.colorScheme.surface)
            .border(BorderStroke(1.dp, guide), AppShape.md),
    ) {
        if (state.isEmpty) {
            Text(
                text = hint,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.Center),
            )
        }
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(state) {
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        down.consume()
                        state.begin(down.position, down.uptimeMillis)
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == down.id } ?: break
                            if (!change.pressed) break
                            state.extend(change.position, change.uptimeMillis)
                            change.consume()
                        }
                        state.end()
                    }
                },
        ) {
            val baseline = size.height * 0.78f
            drawLine(guide, Offset(24.dp.toPx(), baseline), Offset(size.width - 24.dp.toPx(), baseline), 1.dp.toPx())
            state.strokes.forEach { drawStroke(it, ink) }
            drawStroke(state.current, ink)
        }
        Text(
            text = "×",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 8.dp, bottom = 8.dp),
        )
    }
}

private fun DrawScope.drawStroke(points: List<SignaturePoint>, color: Color) {
    if (points.isEmpty()) return
    val width = 3.dp.toPx()
    if (points.size == 1) {
        drawCircle(color, radius = width / 2, center = Offset(points[0].x, points[0].y))
        return
    }
    val path = Path().apply {
        moveTo(points[0].x, points[0].y)
        // Сглаживание: кривая через середины соседних отрезков
        for (i in 1 until points.size) {
            val previous = points[i - 1]
            val point = points[i]
            quadraticTo(previous.x, previous.y, (previous.x + point.x) / 2, (previous.y + point.y) / 2)
        }
        lineTo(points.last().x, points.last().y)
    }
    drawPath(path, color, style = Stroke(width = width, cap = StrokeCap.Round, join = StrokeJoin.Round))
}
