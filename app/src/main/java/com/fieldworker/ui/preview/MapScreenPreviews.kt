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
import com.fieldworker.ui.map.PriorityBadge
import com.fieldworker.ui.map.TasksStatsBar
import com.fieldworker.ui.map.toColor
import com.fieldworker.ui.theme.FieldWorkerTheme

// ==================== Map Screen Previews ====================

@Preview(name = "TasksStatsBar", showBackground = true)
@Composable
private fun TasksStatsBarPreview() {
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
private fun PriorityLegendPreview() {
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
                        PriorityBadge(priority = priority)
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
private fun StatusLegendPreview() {
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

@Preview(name = "Full Legend", showBackground = true)
@Composable
private fun FullLegendPreview() {
    FieldWorkerTheme {
        Surface {
            Row(
                modifier = Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(32.dp)
            ) {
                // Приоритеты
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "Приоритет",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Priority.entries.forEach { priority ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            PriorityBadge(priority = priority)
                            Text(
                                text = priority.displayName,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                }
                
                // Статусы
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "Статус",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold
                    )
                    TaskStatus.entries.filter { it != TaskStatus.UNKNOWN }.forEach { status ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(14.dp)
                                    .clip(CircleShape)
                                    .background(status.toColor())
                            )
                            Text(
                                text = status.displayName,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                }
            }
        }
    }
}
