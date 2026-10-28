package com.fieldworker.ui.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.components.TaskCard
import com.fieldworker.ui.list.*
import com.fieldworker.ui.map.StatusChangeDialog
import com.fieldworker.ui.map.toColor
import com.fieldworker.ui.theme.FieldWorkerTheme
import com.fieldworker.ui.utils.priorityColor

// ==================== Preview Parameter Providers ====================

class TaskPreviewProvider : PreviewParameterProvider<Task> {
    override val values: Sequence<Task> = PreviewData.sampleTasks.asSequence()
}

class PriorityPreviewProvider : PreviewParameterProvider<Priority> {
    override val values: Sequence<Priority> = Priority.entries.asSequence()
}

class StatusPreviewProvider : PreviewParameterProvider<TaskStatus> {
    override val values: Sequence<TaskStatus> = TaskStatus.entries
        .filter { it != TaskStatus.UNKNOWN }
        .asSequence()
}

// ==================== TaskCard Previews ====================

@Preview(name = "TaskCard - Single", showBackground = true)
@Composable
internal fun TaskCardPreview() {
    FieldWorkerTheme {
        Surface {
            TaskCard(
                task = PreviewData.taskEmergency,
                isSelected = false,
                onClick = {},
                userLat = 59.85,
                userLon = 30.26
            )
        }
    }
}

@Preview(name = "TaskCard - Selected", showBackground = true)
@Composable
internal fun TaskCardSelectedPreview() {
    FieldWorkerTheme {
        Surface {
            TaskCard(
                task = PreviewData.taskUrgent,
                isSelected = true,
                onClick = {},
                userLat = 59.85,
                userLon = 30.26
            )
        }
    }
}

@Preview(name = "TaskCard - All Priorities", showBackground = true)
@Composable
internal fun TaskCardAllPrioritiesPreview() {
    FieldWorkerTheme {
        Surface {
            Column(
                modifier = Modifier.padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TaskCard(
                    task = PreviewData.taskEmergency,
                    isSelected = false,
                    onClick = {}
                )
                TaskCard(
                    task = PreviewData.taskUrgent,
                    isSelected = false,
                    onClick = {}
                )
                TaskCard(
                    task = PreviewData.taskCurrent,
                    isSelected = false,
                    onClick = {}
                )
                TaskCard(
                    task = PreviewData.taskPlanned,
                    isSelected = false,
                    onClick = {}
                )
            }
        }
    }
}

@Preview(name = "TaskCard - Dark Theme", showBackground = true)
@Composable
internal fun TaskCardDarkPreview() {
    FieldWorkerTheme(darkTheme = true) {
        Surface {
            TaskCard(
                task = PreviewData.taskEmergency,
                isSelected = false,
                onClick = {}
            )
        }
    }
}

@Preview(name = "TaskCard - Variants", showBackground = true, backgroundColor = 0xFFF5F7FA)
@Composable
internal fun TaskCardVariantsPreview() {
    FieldWorkerTheme {
        Surface {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                TaskCard(
                    task = PreviewData.taskCurrent,
                    isSelected = false,
                    onClick = {},
                    userLat = 59.85,
                    userLon = 30.26
                )
            }
        }
    }
}

// ==================== TaskListScreen Previews ====================

@Preview(name = "TaskListScreen - Full", showBackground = true, showSystemUi = true)
@Composable
internal fun TaskListScreenPreview() {
    FieldWorkerTheme {
        Surface(color = MaterialTheme.colorScheme.background) {
            TaskListScreen(
                tasks = PreviewData.sampleTasks,
                comments = emptyList(),
                isLoading = false,
                isLoadingComments = false,
                selectedTask = null,
                showStatusDialog = false,
                onRefresh = {},
                onTaskClick = {},
                onTaskDismiss = {},
                onStatusChange = {},
                onHideStatusDialog = {},
                onStatusSelected = { _, _, _ -> },
                onAddComment = { _, _ -> },
                statusFilter = emptySet(),
                searchQuery = "",
                onStatusFilterChange = {},
                onSearchQueryChange = {}
            )
        }
    }
}

@Preview(name = "TaskListScreen - Loading", showBackground = true, showSystemUi = true)
@Composable
internal fun TaskListScreenLoadingPreview() {
    FieldWorkerTheme {
        Surface(color = MaterialTheme.colorScheme.background) {
            TaskListScreen(
                tasks = emptyList(),
                comments = emptyList(),
                isLoading = true,
                isLoadingComments = false,
                selectedTask = null,
                showStatusDialog = false,
                onRefresh = {},
                onTaskClick = {},
                onTaskDismiss = {},
                onStatusChange = {},
                onHideStatusDialog = {},
                onStatusSelected = { _, _, _ -> },
                onAddComment = { _, _ -> },
                statusFilter = emptySet(),
                searchQuery = "",
                onStatusFilterChange = {},
                onSearchQueryChange = {}
            )
        }
    }
}

@Preview(name = "TaskListScreen - Empty", showBackground = true, showSystemUi = true)
@Composable
internal fun TaskListScreenEmptyPreview() {
    FieldWorkerTheme {
        Surface(color = MaterialTheme.colorScheme.background) {
            TaskListScreen(
                tasks = emptyList(),
                comments = emptyList(),
                isLoading = false,
                isLoadingComments = false,
                selectedTask = null,
                showStatusDialog = false,
                onRefresh = {},
                onTaskClick = {},
                onTaskDismiss = {},
                onStatusChange = {},
                onHideStatusDialog = {},
                onStatusSelected = { _, _, _ -> },
                onAddComment = { _, _ -> },
                statusFilter = emptySet(),
                searchQuery = "",
                onStatusFilterChange = {},
                onSearchQueryChange = {}
            )
        }
    }
}

// ==================== FiltersPanel Preview ====================

@Preview(name = "FiltersPanel", showBackground = true)
@Composable
internal fun FiltersPanelPreview() {
    FieldWorkerTheme {
        Surface {
            FiltersPanel(
                statusFilter = setOf(TaskStatus.NEW, TaskStatus.IN_PROGRESS),
                onStatusFilterChange = {},
                sortOrder = com.fieldworker.ui.utils.TaskSortOrder.BY_DATE_DESC,
                onSortOrderChange = {},
                onClearFilters = {}
            )
        }
    }
}

// ==================== Badge Previews ====================

@Preview(name = "Priority Colors - All", showBackground = true)
@Composable
internal fun PriorityBadgeAllPreview() {
    FieldWorkerTheme {
        Surface {
            Row(
                modifier = Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Priority.entries.forEach { priority ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(14.dp)
                                .background(priorityColor(priority), CircleShape),
                        )
                        Text(text = priority.displayName)
                    }
                }
            }
        }
    }
}

@Preview(name = "Status Colors - All", showBackground = true)
@Composable
internal fun StatusColorsPreview() {
    FieldWorkerTheme {
        Surface {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TaskStatus.entries.filter { it != TaskStatus.UNKNOWN }.forEach { status ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(16.dp)
                                .background(status.toColor(), shape = androidx.compose.foundation.shape.CircleShape)
                        )
                        Text(text = status.displayName)
                    }
                }
            }
        }
    }
}

// ==================== StatusChangeDialog Preview ====================

@Preview(name = "StatusChangeDialog", showBackground = true)
@Composable
internal fun StatusChangeDialogPreview() {
    FieldWorkerTheme {
        StatusChangeDialog(
            currentStatus = TaskStatus.NEW,
            onDismiss = {},
            onStatusSelected = { _, _ -> }
        )
    }
}

// ==================== TaskDetailBottomSheet Preview ====================

@Preview(name = "TaskDetailBottomSheet", showBackground = true, showSystemUi = true)
@Composable
internal fun TaskDetailBottomSheetPreview() {
    FieldWorkerTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            TaskDetailBottomSheet(
                task = PreviewData.taskEmergency,
                comments = PreviewData.sampleComments,
                isLoadingComments = false,
                onDismiss = {},
                onStatusChange = {},
                onAddComment = {}
            )
        }
    }
}

@Preview(name = "TaskDetailContent", showBackground = true, showSystemUi = true)
@Composable
internal fun TaskDetailContentPreview() {
    FieldWorkerTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            TaskDetailContent(
                task = PreviewData.taskEmergency,
                comments = PreviewData.sampleComments,
                isLoadingComments = false,
                onStatusChange = {},
                onAddComment = {},
                onPlannedDateChange = {},
                onAssignClick = {}
            )
        }
    }
}

// ==================== Skeleton Previews ====================

@Preview(name = "TaskListItemSkeleton", showBackground = true)
@Composable
internal fun TaskListItemSkeletonPreview() {
    FieldWorkerTheme {
        Surface {
            TaskListItemSkeleton()
        }
    }
}

@Preview(name = "TaskListSkeleton", showBackground = true)
@Composable
internal fun TaskListSkeletonPreview() {
    FieldWorkerTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            TaskListSkeleton(count = 3)
        }
    }
}

// ==================== SearchBar Preview ====================

@Preview(name = "SearchBar - Empty", showBackground = true)
@Composable
internal fun SearchBarEmptyPreview() {
    FieldWorkerTheme {
        Surface {
            SearchBar(
                query = "",
                onQueryChange = {},
                onToggleFilters = {},
                hasActiveFilters = false
            )
        }
    }
}

@Preview(name = "SearchBar - With Query", showBackground = true)
@Composable
internal fun SearchBarWithQueryPreview() {
    FieldWorkerTheme {
        Surface {
            SearchBar(
                query = "Ленинский проспект",
                onQueryChange = {},
                onToggleFilters = {},
                hasActiveFilters = true
            )
        }
    }
}

// ==================== Device Previews ====================

@Preview(
    name = "Phone",
    device = "spec:width=411dp,height=891dp",
    showSystemUi = true
)
@Composable
internal fun PhonePreview() {
    FieldWorkerTheme {
        TaskListScreen(
            tasks = PreviewData.sampleTasks,
            comments = emptyList(),
            isLoading = false,
            isLoadingComments = false,
            selectedTask = null,
            showStatusDialog = false,
            onRefresh = {},
            onTaskClick = {},
            onTaskDismiss = {},
            onStatusChange = {},
            onHideStatusDialog = {},
            onStatusSelected = { _, _, _ -> },
            onAddComment = { _, _ -> },
            statusFilter = emptySet(),
            searchQuery = "",
            onStatusFilterChange = {},
            onSearchQueryChange = {}
        )
    }
}

@Preview(
    name = "Tablet",
    device = "spec:width=1280dp,height=800dp,dpi=240",
    showSystemUi = true
)
@Composable
internal fun TabletPreview() {
    FieldWorkerTheme {
        TaskListScreen(
            tasks = PreviewData.sampleTasks,
            comments = emptyList(),
            isLoading = false,
            isLoadingComments = false,
            selectedTask = null,
            showStatusDialog = false,
            onRefresh = {},
            onTaskClick = {},
            onTaskDismiss = {},
            onStatusChange = {},
            onHideStatusDialog = {},
            onStatusSelected = { _, _, _ -> },
            onAddComment = { _, _ -> },
            statusFilter = emptySet(),
            searchQuery = "",
            onStatusFilterChange = {},
            onSearchQueryChange = {}
        )
    }
}

// ==================== Theme Comparison ====================

@Preview(name = "Light Theme", showBackground = true)
@Composable
internal fun LightThemePreview() {
    FieldWorkerTheme(darkTheme = false) {
        Surface {
            Column(
                modifier = Modifier.padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TaskCard(
                    task = PreviewData.taskEmergency,
                    isSelected = false,
                    onClick = {}
                )
                TaskCard(
                    task = PreviewData.taskPlanned,
                    isSelected = true,
                    onClick = {}
                )
            }
        }
    }
}

@Preview(name = "Dark Theme", showBackground = true)
@Composable
internal fun DarkThemePreview() {
    FieldWorkerTheme(darkTheme = true) {
        Surface {
            Column(
                modifier = Modifier.padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TaskCard(
                    task = PreviewData.taskEmergency,
                    isSelected = false,
                    onClick = {}
                )
                TaskCard(
                    task = PreviewData.taskPlanned,
                    isSelected = true,
                    onClick = {}
                )
            }
        }
    }
}
