package com.fieldworker.ui.components

import android.view.HapticFeedbackConstants
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.map.toColor
import com.fieldworker.ui.map.toIcon
import com.fieldworker.ui.utils.TaskUtils
import com.fieldworker.ui.utils.isAttention
import com.fieldworker.ui.utils.priorityColor

/** Дальше этого расстояние считаем недостоверным и не показываем. */
private const val MAX_DISTANCE_METERS = 300_000f

@Composable
fun TaskCard(
    task: Task,
    modifier: Modifier = Modifier,
    isSelected: Boolean = false,
    showArrow: Boolean = false,
    userLat: Double? = null,
    userLon: Double? = null,
    onClick: () -> Unit,
) {
    val view = LocalView.current
    val ui = rememberTaskCardUi(task, userLat, userLon)
    val priorityIsAttention = task.priority.isAttention()
    // Полоса — только у аварийной: единственный красный сигнал в ленте
    val barColor = if (priorityIsAttention) ui.priorityColor else Color.Transparent
    val showPriorityLabel = priorityIsAttention || task.priority == Priority.URGENT

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable {
                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                onClick()
            },
        shape = RoundedCornerShape(12.dp),
        color = if (isSelected) {
            MaterialTheme.colorScheme.primary.copy(alpha = 0.06f)
        } else {
            MaterialTheme.colorScheme.surface
        },
        border = BorderStroke(
            if (isSelected) 1.5.dp else 1.dp,
            if (isSelected) {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.55f)
            } else {
                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
            }
        ),
    ) {
        Row(modifier = Modifier.height(IntrinsicSize.Min)) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(if (isSelected) 5.dp else 4.dp)
                    .background(barColor)
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    StatusChip(task = task)
                    Text(
                        text = "#${ui.displayNumber}",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    // Ярлык приоритета показываем только когда он что-то значит
                    // (аварийная — красным, срочная — нейтрально); рутина без шума.
                    if (showPriorityLabel) {
                        BulletDot()
                        if (priorityIsAttention) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = null,
                                tint = ui.priorityColor,
                                modifier = Modifier.size(14.dp),
                            )
                        }
                        Text(
                            text = task.priority.displayName,
                            style = MaterialTheme.typography.labelMedium,
                            color = ui.priorityColor,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                    }
                    Spacer(modifier = Modifier.weight(1f))
                    Text(
                        text = ui.formattedDate,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (showArrow) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }

                Text(
                    text = ui.primaryTitle,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurface,
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = task.address,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (ui.distance != null) {
                        BulletDot()
                        Text(
                            text = ui.distance,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                    }
                    if (ui.formattedPlannedDate != null) {
                        BulletDot()
                        // Цветом отмечаем только просрочку; обычная план-дата — тихий серый.
                        val plannedColor = if (ui.isPlannedOverdue) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        }
                        val plannedPrefix = if (ui.isPlannedOverdue) "просрочено" else "план"
                        Text(
                            text = "$plannedPrefix ${ui.formattedPlannedDate}",
                            style = MaterialTheme.typography.bodySmall,
                            color = plannedColor,
                            fontWeight = if (ui.isPlannedOverdue) FontWeight.SemiBold else FontWeight.Normal,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BulletDot() {
    Text(
        text = "·",
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.outline,
    )
}

/**
 * Компактный чип статуса: точка в цвете статуса + подпись. Заменяет прежний
 * безымянный кружок — статус теперь читается без легенды.
 */
@Composable
private fun StatusChip(task: Task) {
    val color = task.status.toColor()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 7.dp, vertical = 2.dp),
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(color),
        )
        Text(
            text = task.status.displayName,
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
        )
    }
}

private data class TaskCardUi(
    val priorityColor: Color,
    val distance: String?,
    val formattedDate: String,
    val formattedPlannedDate: String?,
    val isPlannedOverdue: Boolean,
    val displayNumber: String,
    val primaryTitle: String,
)

@Composable
private fun rememberTaskCardUi(
    task: Task,
    userLat: Double?,
    userLon: Double?,
): TaskCardUi = remember(task, userLat, userLon) {
    val displayNumber = task.getDisplayNumber()
    TaskCardUi(
        priorityColor = priorityColor(task.priority),
        // Прячем неправдоподобную дистанцию: нет фикса геолокации или кривые
        // координаты дают сотни/тысячи км — это мусор, а не полезный ориентир.
        distance = TaskUtils.calculateDistance(userLat, userLon, task.lat, task.lon)
            ?.takeIf { it in 0f..MAX_DISTANCE_METERS }
            ?.let { TaskUtils.formatDistance(it) },
        formattedDate = TaskUtils.formatCompactDate(task.createdAt),
        formattedPlannedDate = task.plannedDate?.let { TaskUtils.formatShortDate(it) },
        isPlannedOverdue = task.status != TaskStatus.DONE
            && task.status != TaskStatus.CANCELLED
            && task.status != TaskStatus.UNKNOWN
            && TaskUtils.isDateOverdue(task.plannedDate),
        displayNumber = displayNumber,
        primaryTitle = taskHeadline(task, displayNumber),
    )
}

/**
 * Заголовок карточки — суть работы, а не адрес (адрес и так идёт отдельной
 * строкой ниже). Берём описание работ; если его нет — падаем на очищенный title.
 * У title в этих данных лежит адрес, поэтому без описания заголовок совпадёт с
 * адресной строкой — это осознанный fallback, лучше чем пусто.
 */
private fun taskHeadline(task: Task, displayNumber: String): String {
    val raw = task.description?.trim().orEmpty()
    if (raw.isBlank()) return formatTaskTitle(task, displayNumber)

    // 1. Многострочный случай: отбрасываем целиком строки-номера («№70/ №35980»).
    var text = raw.lineSequence()
        .map { it.trim() }
        .filter { line -> line.isNotEmpty() && line.replace(SERVICE_CHARS, "").isNotEmpty() }
        .joinToString(" ")
        .trim()

    // 2. Инлайн-префикс в одной строке: «№11/ №33522  08.05.2026 ЭЛЬТОН <текст>».
    //    Срезаем ведущие «№../ №.. дата», и только если он был — следующий за ним
    //    ALL-CAPS токен организации (иначе можно случайно съесть слово вроде «СРОЧНО»).
    val withoutRefs = text.replaceFirst(LEADING_REF_PREFIX, "")
    if (withoutRefs != text) {
        text = withoutRefs.replaceFirst(LEADING_ORG_TOKEN, "").trim()
    }

    // 3. Телефон есть в отдельном поле — в заголовке он только съедает место.
    text = text.replace(INLINE_PHONE, "").trim().trimEnd(',', ';', ':').trim()

    return text.ifBlank { formatTaskTitle(task, displayNumber) }
}

/** «Телефон: +79219876543» / «тел. 8921…» внутри описания. */
private val INLINE_PHONE = Regex("""(?:тел(?:ефон)?\.?\s*:?\s*)?\+?[78]\d{10}""", RegexOption.IGNORE_CASE)

/** Символы служебных строк-номеров: цифры, №, разделители, пунктуация. */
private val SERVICE_CHARS = Regex("[№#\\d/\\\\\\s.,;:()\\-–—]")

/** Ведущий «№11/ №33522» + прилипшая к нему дата/числа. */
private val LEADING_REF_PREFIX = Regex("^№?\\s*\\d+\\s*/\\s*№?\\s*[\\d.\\s]+")

/** ALL-CAPS токен-организация сразу после номерного префикса (напр. «ЭЛЬТОН»). */
private val LEADING_ORG_TOKEN = Regex("^[А-ЯЁA-Z]{3,}\\s+")

internal fun formatTaskTitle(task: Task, displayNumber: String): String {
    val escapedNumber = Regex.escape(displayNumber)
    val cleaned = task.title
        .trim()
        .replaceFirst(Regex("^\\[$escapedNumber]\\s*"), "")
        .replaceFirst(Regex("^(?:№|N|No|в„–)\\s*$escapedNumber\\s*[-–—:]?\\s*"), "")
        .trim()
    return if (cleaned.isBlank()) task.title.trim() else cleaned
}

/**
 * Компактная версия карточки для отображения в списке внизу карты.
 */
@Composable
fun CompactTaskCard(
    task: Task,
    modifier: Modifier = Modifier,
    isSelected: Boolean = false,
    onClick: () -> Unit
) {
    val view = LocalView.current
    val priorityColor = priorityColor(task.priority)
    val statusColor = task.status.toColor()
    val statusIcon = task.status.toIcon()
    val displayNumber = remember(task.taskNumber, task.id, task.title) { task.getDisplayNumber() }

    Card(
        modifier = modifier
            .clickable {
                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                onClick()
            },
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surface
            }
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (isSelected) 2.dp else 0.dp
        ),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Row(
            modifier = Modifier.height(IntrinsicSize.Min)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(3.dp)
                    .background(if (task.priority.isAttention()) priorityColor else Color.Transparent)
            )

            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(MaterialTheme.shapes.medium)
                        .background(statusColor.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = statusIcon,
                        contentDescription = null,
                        tint = statusColor,
                        modifier = Modifier.size(20.dp)
                    )
                }

                Spacer(modifier = Modifier.width(10.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = "#$displayNumber",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold
                        )
                        BulletDot()
                        Text(
                            text = task.priority.displayName,
                            style = MaterialTheme.typography.labelSmall,
                            color = priorityColor,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    Text(
                        text = task.address,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Icon(
                    imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}
