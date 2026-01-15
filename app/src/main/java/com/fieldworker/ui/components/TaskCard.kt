package com.fieldworker.ui.components

import android.view.HapticFeedbackConstants
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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

/**
 * Унифицированная карточка заявки для списка и карты.
 * Единообразный дизайн: цветная полоска приоритета сверху,
 * иконка статуса слева, информация в центре.
 */
@Composable
fun TaskCard(
    task: Task,
    modifier: Modifier = Modifier,
    isSelected: Boolean = false,
    showArrow: Boolean = true,
    userLat: Double? = null,
    userLon: Double? = null,
    onClick: () -> Unit
) {
    val view = LocalView.current

    val priorityColor = when (task.priority) {
        Priority.EMERGENCY -> Color(0xFFFF3B30)
        Priority.URGENT -> Color(0xFFFF9500)
        Priority.CURRENT -> Color(0xFF0A84FF)
        Priority.PLANNED -> Color(0xFF34C759)
    }

    val priorityBgColor = when (task.priority) {
        Priority.EMERGENCY -> Color(0xFFFFEBEE)
        Priority.URGENT -> Color(0xFFFFF3E0)
        Priority.CURRENT -> Color(0xFFE3F2FD)
        Priority.PLANNED -> Color(0xFFE8F5E9)
    }

    val distance = remember(task, userLat, userLon) {
        TaskUtils.formatDistance(
            TaskUtils.calculateDistance(userLat, userLon, task.lat, task.lon)
        )
    }

    val formattedDate = remember(task.createdAt) {
        TaskUtils.formatShortDate(task.createdAt)
    }

    val formattedPlannedDate = remember(task.plannedDate) {
        task.plannedDate?.let { TaskUtils.formatShortDate(it) }
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable {
                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                onClick()
            },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (isSelected) 2.dp else 0.dp
        ),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(4.dp)
                    .background(priorityColor.copy(alpha = 0.9f))
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(14.dp),
                verticalAlignment = Alignment.Top
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(MaterialTheme.shapes.medium)
                        .background(task.status.toColor().copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = task.status.toIcon(),
                        contentDescription = null,
                        tint = task.status.toColor(),
                        modifier = Modifier.size(24.dp)
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = priorityBgColor
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(3.dp)
                            ) {
                                if (task.priority == Priority.EMERGENCY || task.priority == Priority.URGENT) {
                                    Icon(
                                        imageVector = Icons.Default.Warning,
                                        contentDescription = null,
                                        tint = priorityColor,
                                        modifier = Modifier.size(10.dp)
                                    )
                                }
                                Text(
                                    text = task.priority.displayName,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = priorityColor,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        Text(
                            text = "#${task.getDisplayNumber()}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = task.status.toColor().copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = task.status.displayName,
                                style = MaterialTheme.typography.labelSmall,
                                color = task.status.toColor(),
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    Text(
                        text = task.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.LocationOn,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = priorityColor
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = task.address,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        if (distance != null) {
                            Text(
                                text = distance,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.DateRange,
                                contentDescription = null,
                                modifier = Modifier.size(12.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.width(3.dp))
                            Text(
                                text = formattedDate,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        if (formattedPlannedDate != null) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.Star,
                                    contentDescription = null,
                                    modifier = Modifier.size(12.dp),
                                    tint = Color(0xFFFF9500)
                                )
                                Spacer(modifier = Modifier.width(3.dp))
                                Text(
                                    text = formattedPlannedDate,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color(0xFFFF9500),
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                }

                if (showArrow) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Icon(
                        Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.align(Alignment.CenterVertically)
                    )
                }
            }
        }
    }
}


/**
 * Компактная версия карточки для отображения в списке внизу карты
 */
@Composable
fun CompactTaskCard(
    task: Task,
    modifier: Modifier = Modifier,
    isSelected: Boolean = false,
    onClick: () -> Unit
) {
    val view = LocalView.current

    val priorityColor = when (task.priority) {
        Priority.EMERGENCY -> Color(0xFFFF3B30)
        Priority.URGENT -> Color(0xFFFF9500)
        Priority.CURRENT -> Color(0xFF0A84FF)
        Priority.PLANNED -> Color(0xFF34C759)
    }

    Card(
        modifier = modifier
            .clickable {
                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                onClick()
            },
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected)
                MaterialTheme.colorScheme.primaryContainer
            else
                MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (isSelected) 2.dp else 0.dp
        ),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Row(
            modifier = Modifier
                .height(IntrinsicSize.Min)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(3.dp)
                    .background(priorityColor.copy(alpha = 0.9f))
            )

            Row(
                modifier = Modifier
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(MaterialTheme.shapes.medium)
                        .background(task.status.toColor().copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = task.status.toIcon(),
                        contentDescription = null,
                        tint = task.status.toColor(),
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
                            text = "#${task.getDisplayNumber()}",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "?",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
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
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

