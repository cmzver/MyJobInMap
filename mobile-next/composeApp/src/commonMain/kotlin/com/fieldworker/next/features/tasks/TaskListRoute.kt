package com.fieldworker.next.features.tasks

import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.pullToRefresh
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.fieldworker.next.core.designsystem.FwCard
import com.fieldworker.next.core.designsystem.FwColors
import com.fieldworker.next.core.designsystem.FwEmptyState
import com.fieldworker.next.core.designsystem.FwFilterChip
import com.fieldworker.next.core.designsystem.FwListSkeleton
import com.fieldworker.next.core.designsystem.FwStatusChip
import com.fieldworker.next.core.designsystem.FwTheme
import com.fieldworker.next.core.designsystem.MetricTile
import com.fieldworker.next.domain.model.TaskPriority
import com.fieldworker.next.domain.model.TaskStatus
import com.fieldworker.next.domain.model.TaskSummary
import org.koin.compose.viewmodel.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskListRoute(
    modifier: Modifier = Modifier,
    onTaskSelected: (Long) -> Unit,
    viewModel: TaskListViewModel = koinViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var showSearch by remember { mutableStateOf(false) }

    val pullToRefreshState = rememberPullToRefreshState()
    Box(
        modifier = modifier
            .pullToRefresh(
                state = pullToRefreshState,
                isRefreshing = state.isRefreshing,
                onRefresh = viewModel::refresh,
            ),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
        // Header
        item {
            Column(
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Заявки",
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    IconButton(onClick = { showSearch = !showSearch }) {
                        Icon(
                            imageVector = if (showSearch) Icons.Rounded.Close else Icons.Outlined.Search,
                            contentDescription = "Поиск",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        // Search bar
        if (showSearch) {
            item {
                SearchBar(
                    query = state.searchQuery,
                    onQueryChange = viewModel::onSearchQueryChanged,
                    modifier = Modifier.padding(horizontal = 20.dp),
                )
                Spacer(Modifier.height(12.dp))
            }
        }

        // Metrics row
        item {
            Row(
                modifier = Modifier.padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                MetricTile(
                    title = "Активные",
                    value = state.board.activeCount.toString(),
                    caption = "",
                    modifier = Modifier.weight(1f),
                    icon = Icons.Rounded.AccessTime,
                )
                MetricTile(
                    title = "Просрочено",
                    value = state.board.overdueCount.toString(),
                    caption = "",
                    modifier = Modifier.weight(1f),
                    accent = MaterialTheme.colorScheme.error,
                    icon = Icons.Rounded.Warning,
                )
                MetricTile(
                    title = "Закрыто",
                    value = state.board.completedTodayCount.toString(),
                    caption = "",
                    modifier = Modifier.weight(1f),
                    accent = FwTheme.extended.success,
                    icon = Icons.Rounded.CheckCircle,
                )
            }
        }

        // Filters
        item {
            LazyRow(
                modifier = Modifier.padding(vertical = 12.dp),
                contentPadding = PaddingValues(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(TaskFilter.entries.toList(), key = { it.name }) { filter ->
                    FwFilterChip(
                        text = filter.title,
                        selected = state.filter == filter,
                        onClick = { viewModel.onFilterChanged(filter) },
                    )
                }
            }
        }

        // Loading
        if (state.isLoading) {
            item {
                FwListSkeleton(
                    modifier = Modifier.padding(horizontal = 20.dp),
                )
            }
        }

        // Empty state
        if (!state.isLoading && state.visibleTasks.isEmpty()) {
            item {
                FwEmptyState(
                    icon = Icons.Rounded.Inbox,
                    title = "Нет заявок",
                    subtitle = "Здесь появятся назначенные вам заявки",
                )
            }
        }

        // Task list
        items(
            items = state.visibleTasks,
            key = TaskSummary::id,
        ) { task ->
            TaskCard(
                task = task,
                onClick = { onTaskSelected(task.id) },
                modifier = Modifier.padding(horizontal = 20.dp).animateItem(),
            )
        }
    }
        if (state.isRefreshing) {
            LinearProgressIndicator(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter),
            )
        }
    }
}

@Composable
private fun SearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    TextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = modifier.fillMaxWidth(),
        placeholder = {
            Text(
                "Поиск по заявкам...",
                style = MaterialTheme.typography.bodyMedium,
            )
        },
        leadingIcon = {
            Icon(
                imageVector = Icons.Outlined.Search,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
        },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "Очистить",
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        },
        singleLine = true,
        shape = MaterialTheme.shapes.medium,
        colors = TextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        ),
        textStyle = MaterialTheme.typography.bodyMedium,
    )
}

@Composable
fun TaskCard(
    task: TaskSummary,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    FwCard(
        modifier = modifier,
        onClick = onClick,
        contentPadding = 0.dp,
    ) {
        Row(
            modifier = Modifier.height(IntrinsicSize.Min),
        ) {
            // Priority color stripe
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .fillMaxHeight()
                    .background(
                        priorityColor(task.priority),
                        RoundedCornerShape(topStart = 12.dp, bottomStart = 12.dp),
                    ),
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                // Title row + status
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        text = task.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).padding(end = 8.dp),
                    )
                    FwStatusChip(
                        text = statusLabel(task.status),
                        containerColor = statusContainerColor(task.status),
                        contentColor = statusContentColor(task.status),
                    )
                }

                // Address
                Text(
                    text = task.address,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                // Bottom row: number, priority, date, overdue
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = task.number,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = "•",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.outline,
                    )
                    Text(
                        text = priorityLabel(task.priority),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = priorityColor(task.priority),
                    )
                    if (task.plannedLabel.isNotBlank()) {
                        Text(
                            text = "•",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline,
                        )
                        Text(
                            text = task.plannedLabel,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (task.isOverdue) {
                        Spacer(Modifier.weight(1f))
                        FwStatusChip(
                            text = "Просрочено",
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                            contentColor = MaterialTheme.colorScheme.error,
                            icon = Icons.Rounded.ErrorOutline,
                        )
                    }
                }
            }
        }
    }
}

// ── Helper functions ────────────────────────────────────────────

@Composable
private fun statusLabel(status: TaskStatus): String = when (status) {
    TaskStatus.NEW -> "Новая"
    TaskStatus.IN_PROGRESS -> "В работе"
    TaskStatus.DONE -> "Выполнена"
    TaskStatus.CANCELLED -> "Отменена"
}

@Composable
private fun statusContainerColor(status: TaskStatus): Color = when (status) {
    TaskStatus.NEW -> FwColors.Blue50
    TaskStatus.IN_PROGRESS -> Color(0xFFFFF7ED)
    TaskStatus.DONE -> FwColors.Green50
    TaskStatus.CANCELLED -> FwColors.Slate100
}

@Composable
private fun statusContentColor(status: TaskStatus): Color = when (status) {
    TaskStatus.NEW -> FwColors.Blue600
    TaskStatus.IN_PROGRESS -> FwColors.Amber600
    TaskStatus.DONE -> FwColors.Green700
    TaskStatus.CANCELLED -> FwColors.Slate500
}

private fun priorityColor(priority: TaskPriority): Color = when (priority) {
    TaskPriority.EMERGENCY -> FwColors.Red500
    TaskPriority.URGENT -> FwColors.Amber500
    TaskPriority.CURRENT -> FwColors.Blue500
    TaskPriority.PLANNED -> FwColors.Green500
}

private fun priorityLabel(priority: TaskPriority): String = when (priority) {
    TaskPriority.EMERGENCY -> "Аварийная"
    TaskPriority.URGENT -> "Срочная"
    TaskPriority.CURRENT -> "Текущая"
    TaskPriority.PLANNED -> "Плановая"
}
