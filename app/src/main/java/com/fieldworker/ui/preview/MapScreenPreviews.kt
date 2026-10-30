package com.fieldworker.ui.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.map.TasksStatsBar
import com.fieldworker.ui.map.toColor
import com.fieldworker.ui.theme.FieldWorkerTheme
import com.fieldworker.ui.utils.priorityColor

// ==================== Map Screen Previews ====================

@Preview(name = "TasksStatsBar", showBackground = true)
@Composable
internal fun TasksStatsBarPreview() {
    FieldWorkerTheme {
        Surface {
            TasksStatsBar(
                tasks = PreviewData.sampleTasks,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

// ==================== Priority Legend ====================

@Preview(name = "Priority Legend", showBackground = true)
@Composable
internal fun PriorityLegendPreview() {
    FieldWorkerTheme {
        Surface {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Приоритеты заявок",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                
                Priority.entries.forEach { priority ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(20.dp)
                                .clip(CircleShape)
                                .background(priorityColor(priority))
                        )
                        Text(
                            text = "${priority.value}. ${priority.displayName}",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }
    }
}

// ==================== Status Legend ====================

@Preview(name = "Status Legend", showBackground = true)
@Composable
internal fun StatusLegendPreview() {
    FieldWorkerTheme {
        Surface {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Статусы заявок",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                
                TaskStatus.entries.filter { it != TaskStatus.UNKNOWN }.forEach { status ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(20.dp)
                                .clip(CircleShape)
                                .background(status.toColor())
                        )
                        Text(
                            text = status.displayName,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }
    }
}

// ==================== Combined Legend Preview ====================

/** Легенда маркеров: цвет = статус, красный — только активная аварийная. */
@Preview(name = "Full Legend", showBackground = true)
@Composable
internal fun FullLegendPreview() {
    FieldWorkerTheme {
        Surface {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Маркер",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold
                )
                val entries = TaskStatus.entries
                    .filter { it != TaskStatus.UNKNOWN }
                    .map { it.displayName to it.toColor() } +
                    ("Аварийная (активная)" to priorityColor(Priority.EMERGENCY))
                entries.forEach { (label, color) ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(14.dp)
                                .clip(CircleShape)
                                .background(color)
                        )
                        Text(text = label, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
