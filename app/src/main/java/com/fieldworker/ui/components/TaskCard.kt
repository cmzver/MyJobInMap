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
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.LocationOn
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
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.map.toColor
import com.fieldworker.ui.map.toIcon
import com.fieldworker.ui.utils.TaskUtils
import com.fieldworker.ui.utils.priorityBackground
import com.fieldworker.ui.utils.priorityColor

@Composable
fun TaskCard(
    task: Task,
    modifier: Modifier = Modifier,
    isSelected: Boolean = false,
    showArrow: Boolean = true,
    userLat: Double? = null,
    userLon: Double? = null,
    onClick: () -> Unit,
) {
    val view = LocalView.current
    val ui = rememberTaskCardUi(task, userLat, userLon)

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
                    .background(ui.priorityColor)
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
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(task.status.toColor())
                    )
                    Text(
                        text = "#${ui.displayNumber}",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    BulletDot()
                    Text(
                        text = task.priority.displayName,
                        style = MaterialTheme.typography.labelMedium,
                        color = ui.priorityColor,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
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
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                        )
                    }
                    if (ui.formattedPlannedDate != null) {
                        BulletDot()
                        val plannedColor = if (ui.isPlannedOverdue) {
                            Color(0xFFFF3B30)
                        } else {
                            Color(0xFFCC7A1A)
                        }
                        val plannedPrefix = if (ui.isPlannedOverdue) "просрочено" else "план"
                        Text(
                            text = "$plannedPrefix ${ui.formattedPlannedDate}",
                            style = MaterialTheme.typography.bodySmall,
                            color = plannedColor,
                            fontWeight = if (ui.isPlannedOverdue) FontWeight.SemiBold else FontWeight.Medium,
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

@Composable
internal fun TaskCardEditorialVariant(
    task: Task,
    modifier: Modifier = Modifier,
    isSelected: Boolean = false,
    showArrow: Boolean = true,
    userLat: Double? = null,
    userLon: Double? = null,
    onClick: () -> Unit,
) {
    val view = LocalView.current
    val ui = rememberTaskCardUi(task, userLat, userLon)

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable {
                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                onClick()
            },
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.22f)
            } else {
                MaterialTheme.colorScheme.surface
            }
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = RoundedCornerShape(28.dp),
        border = BorderStroke(
            1.dp,
            if (isSelected) {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.26f)
            } else {
                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.75f)
            }
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 15.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    PriorityChip(
                        label = task.priority.displayName,
                        accent = ui.priorityColor,
                        background = ui.priorityBgColor,
                    )
                    StatusChip(task = task)
                }

                if (showArrow) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = ui.primaryTitle,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurface,
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = ui.secondaryLine,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            Spacer(modifier = Modifier.height(12.dp))

            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.34f),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 11.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(ui.priorityBgColor),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Default.LocationOn,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = ui.priorityColor,
                        )
                    }
                    Text(
                        text = task.address,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TaskMetaPill(
                        icon = Icons.Default.DateRange,
                        text = ui.formattedDate,
                    )
                    if (ui.formattedPlannedDate != null) {
                        TaskMetaPill(
                            icon = Icons.Default.DateRange,
                            text = ui.formattedPlannedDate,
                            accentColor = Color(0xFFCC7A1A),
                        )
                    }
                    if (task.commentsCount > 0) {
                        TaskCountPill(text = "${task.commentsCount} комм.")
                    }
                }

                if (ui.distance != null) {
                    TaskMetaPill(
                        icon = Icons.Default.LocationOn,
                        text = ui.distance,
                        accentColor = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}

@Composable
internal fun TaskCardBalancedVariant(
    task: Task,
    modifier: Modifier = Modifier,
    isSelected: Boolean = false,
    showArrow: Boolean = true,
    userLat: Double? = null,
    userLon: Double? = null,
    onClick: () -> Unit,
) {
    val view = LocalView.current
    val ui = rememberTaskCardUi(task, userLat, userLon)

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable {
                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                onClick()
            },
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.28f)
            } else {
                MaterialTheme.colorScheme.surface
            }
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = RoundedCornerShape(24.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.8f)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = ui.primaryTitle,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = ui.secondaryLine,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (showArrow) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PriorityChip(
                    label = task.priority.displayName,
                    accent = ui.priorityColor,
                    background = ui.priorityBgColor,
                )
                StatusChip(task = task)
                if (ui.distance != null) {
                    TaskMetaPill(
                        icon = Icons.Default.LocationOn,
                        text = ui.distance,
                        accentColor = MaterialTheme.colorScheme.primary,
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = task.address,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TaskMetaPill(icon = Icons.Default.DateRange, text = ui.formattedDate)
                if (ui.formattedPlannedDate != null) {
                    TaskMetaPill(
                        icon = Icons.Default.DateRange,
                        text = ui.formattedPlannedDate,
                        accentColor = Color(0xFFCC7A1A),
                    )
                }
            }
        }
    }
}

@Composable
internal fun TaskCardRailVariant(
    task: Task,
    modifier: Modifier = Modifier,
    isSelected: Boolean = false,
    showArrow: Boolean = true,
    userLat: Double? = null,
    userLon: Double? = null,
    onClick: () -> Unit,
) {
    val view = LocalView.current
    val ui = rememberTaskCardUi(task, userLat, userLon)

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable {
                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                onClick()
            },
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.22f)
            } else {
                MaterialTheme.colorScheme.surface
            }
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = RoundedCornerShape(22.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)),
    ) {
        Row(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(5.dp)
                    .background(ui.priorityColor.copy(alpha = 0.9f))
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 14.dp, vertical = 14.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = ui.primaryTitle,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = task.address,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (showArrow) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "#${ui.displayNumber}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = task.priority.displayName,
                        style = MaterialTheme.typography.labelMedium,
                        color = ui.priorityColor,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        text = task.status.displayName,
                        style = MaterialTheme.typography.labelMedium,
                        color = task.status.toColor(),
                    )
                    if (ui.distance != null) {
                        Text(
                            text = ui.distance,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }
    }
}

private data class TaskCardUi(
    val priorityColor: Color,
    val priorityBgColor: Color,
    val distance: String?,
    val formattedDate: String,
    val formattedPlannedDate: String?,
    val isPlannedOverdue: Boolean,
    val displayNumber: String,
    val primaryTitle: String,
    val secondaryLine: String,
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
        priorityBgColor = priorityBackground(task.priority),
        distance = TaskUtils.formatDistance(
            TaskUtils.calculateDistance(userLat, userLon, task.lat, task.lon)
        ),
        formattedDate = TaskUtils.formatShortDate(task.createdAt),
        formattedPlannedDate = task.plannedDate?.let { TaskUtils.formatShortDate(it) },
        isPlannedOverdue = task.status != TaskStatus.DONE
            && task.status != TaskStatus.CANCELLED
            && task.status != TaskStatus.UNKNOWN
            && TaskUtils.isDateOverdue(task.plannedDate),
        displayNumber = displayNumber,
        primaryTitle = formatTaskTitle(task, displayNumber),
        secondaryLine = buildString {
            append("#$displayNumber")
            task.assignedUserName?.takeIf { it.isNotBlank() }?.let { append(" • $it") }
        },
    )
}

@Composable
private fun PriorityChip(
    label: String,
    accent: Color,
    background: Color,
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = background,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(accent)
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = accent,
            )
        }
    }
}

@Composable
private fun StatusChip(task: Task) {
    val color = task.status.toColor()
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = color.copy(alpha = 0.12f),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                imageVector = task.status.toIcon(),
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = task.status.displayName,
                style = MaterialTheme.typography.labelLarge,
                color = color,
            )
        }
    }
}

@Composable
private fun TaskCountPill(text: String) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
        )
    }
}

private fun formatTaskTitle(task: Task, displayNumber: String): String {
    val escapedNumber = Regex.escape(displayNumber)
    val cleaned = task.title
        .trim()
        .replaceFirst(Regex("^\\[$escapedNumber]\\s*"), "")
        .replaceFirst(Regex("^(?:№|N|No|в„–)\\s*$escapedNumber\\s*[-–—:]?\\s*"), "")
        .trim()
    return if (cleaned.isBlank()) task.title.trim() else cleaned
}

@Composable
private fun TaskMetaPill(
    icon: ImageVector,
    text: String,
    accentColor: Color = MaterialTheme.colorScheme.onSurfaceVariant
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = accentColor.copy(alpha = 0.10f)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(12.dp),
                tint = accentColor
            )
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                color = accentColor
            )
        }
    }
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
                    .background(priorityColor.copy(alpha = 0.9f))
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
