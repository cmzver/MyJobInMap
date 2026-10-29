@file:OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.fieldworker.ui.list

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.HapticFeedbackConstants
import android.widget.Toast
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults.Indicator
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.paging.LoadState
import androidx.paging.compose.LazyPagingItems
import com.fieldworker.R
import com.fieldworker.domain.model.AddressDetails
import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskPhoto
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.components.PhotoGallery
import com.fieldworker.ui.components.TaskCard
import com.fieldworker.ui.map.StatusChangeDialog
import com.fieldworker.ui.map.TaskScope
import com.fieldworker.ui.map.toIcon
import com.fieldworker.ui.utils.containerColor
import com.fieldworker.ui.utils.contentColor
import com.fieldworker.ui.utils.extractAdditionalInfo
import com.fieldworker.ui.utils.extractApartment
import com.fieldworker.ui.utils.extractPhoneNumber
import com.fieldworker.ui.utils.formatPhoneForDisplay
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private fun normalizePhoneForDial(phone: String) = com.fieldworker.ui.utils.normalizePhoneForDial(phone)

/**
 * Экран со списком задач и фильтрами
 */
@Composable
fun TaskListScreen(
    tasks: List<Task>,
    comments: List<Comment>,
    isLoading: Boolean,
    isLoadingComments: Boolean,
    selectedTask: Task?,
    addressDetails: AddressDetails? = null,
    isLoadingAddress: Boolean = false,
    hasAttemptedAddressLookup: Boolean = false,
    showStatusDialog: Boolean,
    onRefresh: () -> Unit,
    onTaskClick: (Task) -> Unit,
    onTaskDismiss: () -> Unit,
    onStatusChange: () -> Unit,
    onHideStatusDialog: () -> Unit,
    onStatusSelected: (Long, TaskStatus, String) -> Unit,
    onAddComment: (Long, String) -> Unit,
    statusFilter: Set<TaskStatus>,
    searchQuery: String,
    onStatusFilterChange: (Set<TaskStatus>) -> Unit,
    onSearchQueryChange: (String) -> Unit,
    // Новые параметры
    sortOrder: com.fieldworker.ui.utils.TaskSortOrder = com.fieldworker.ui.utils.TaskSortOrder.BY_DATE_DESC,
    onSortOrderChange: (com.fieldworker.ui.utils.TaskSortOrder) -> Unit = {},
    userLat: Double? = null,
    userLon: Double? = null,
    // Paging 3 — постраничный список задач из Room
    pagingItems: LazyPagingItems<Task>? = null,
    // Параметры для фотографий
    photos: List<TaskPhoto> = emptyList(),
    isLoadingPhotos: Boolean = false,
    isUploadingPhoto: Boolean = false,
    baseUrl: String = "",
    authToken: String? = null,
    onOpenObjectCard: () -> Unit = {},
    onAddPhotoClick: () -> Unit = {},
    onDeletePhoto: (Long) -> Unit = {},
    // Параметры для планируемой даты
    onPlannedDateChange: ((Long, String?) -> Unit)? = null,
    // Возможности диспетчера/админа (null — работник, UI скрыт)
    taskScope: TaskScope? = null,
    onTaskScopeChange: (TaskScope) -> Unit = {},
    assignment: TaskAssignmentUi? = null
) {
    var showFilters by remember { mutableStateOf(false) }
    val hasActiveFilters = statusFilter.isNotEmpty() || (taskScope != null && taskScope != TaskScope.ALL)
    val hasSearchQuery = searchQuery.isNotBlank()
    val hasLocalTransforms = hasActiveFilters || hasSearchQuery || sortOrder != com.fieldworker.ui.utils.TaskSortOrder.BY_DATE_DESC

    // Paging активен только без локальных трансформаций (поиск/фильтр/сортировка
    // применяются к обычному списку). Счётчик и список берут данные из него.
    val activePagingItems = pagingItems?.takeIf { !hasLocalTransforms }
    val listState = rememberLazyListState()
    val listScope = rememberCoroutineScope()

    Column(modifier = Modifier.fillMaxSize()) {
        // Поиск
        SearchBar(
            query = searchQuery,
            onQueryChange = onSearchQueryChange,
            onToggleFilters = { showFilters = !showFilters },
            hasActiveFilters = hasActiveFilters
        )
        
        // Панель фильтров
        AnimatedVisibility(
            visible = showFilters,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            FiltersPanel(
                statusFilter = statusFilter,
                onStatusFilterChange = onStatusFilterChange,
                sortOrder = sortOrder,
                onSortOrderChange = onSortOrderChange,
                taskScope = taskScope,
                onTaskScopeChange = onTaskScopeChange,
                onClearFilters = {
                    onStatusFilterChange(emptySet())
                    if (taskScope != null) onTaskScopeChange(TaskScope.ALL)
                }
            )
        }
        
        // Счётчик результатов
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            val displayCount = activePagingItems?.itemCount ?: tasks.size
            // «0 заявок» над пустым состоянием — дубль, его и так видно
            Text(
                text = if (displayCount == 0) "" else
                    "$displayCount ${com.fieldworker.ui.utils.TaskUtils.pluralizeTasks(displayCount)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                letterSpacing = 0.4.sp,
                modifier = Modifier.weight(1f)
            )

            if (isLoading && tasks.isNotEmpty()) {
                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 1.5.dp)
            }
        }
        
        // Список задач с FAB и Pull-to-Refresh
        Box(modifier = Modifier.weight(1f)) {
            val hasFilters = hasSearchQuery || hasActiveFilters

            // Определяем: используем Paging 3 или обычный список
            val usePaging = activePagingItems != null
            val isPagingInitialLoad = activePagingItems?.loadState?.refresh is LoadState.Loading
            val displayEmpty = if (activePagingItems != null) {
                activePagingItems.itemCount == 0 && activePagingItems.loadState.refresh is LoadState.NotLoading
            } else {
                tasks.isEmpty() && !isLoading
            }
            val displaySkeleton = if (usePaging) isPagingInitialLoad else (tasks.isEmpty() && isLoading)
            
            when {
                // Показываем skeleton при первой загрузке
                displaySkeleton -> {
                    TaskListSkeleton()
                }
                // Пустое состояние
                displayEmpty -> {
                    EmptyState(
                        message = if (hasFilters) "Заявки не найдены" else "Заявок нет",
                        isFiltered = hasFilters,
                        onReset = {
                            onStatusFilterChange(emptySet())
                            onSearchQueryChange("")
                        }
                    )
                }
                // Список задач с Pull-to-Refresh
                else -> {
                    val pullToRefreshState = rememberPullToRefreshState()
                    
                    PullToRefreshBox(
                        isRefreshing = isLoading,
                        onRefresh = {
                            activePagingItems?.refresh()
                            onRefresh()
                        },
                        state = pullToRefreshState,
                        modifier = Modifier.fillMaxSize()
                    ) {
                        LazyColumn(
                            state = listState,
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(
                                start = 12.dp,
                                end = 12.dp,
                                top = 6.dp,
                                bottom = 80.dp  // Отступ для FAB «наверх»
                            ),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            val pagedItems = activePagingItems
                            val groupByDate = sortOrder == com.fieldworker.ui.utils.TaskSortOrder.BY_DATE_DESC ||
                                sortOrder == com.fieldworker.ui.utils.TaskSortOrder.BY_DATE_ASC
                            if (pagedItems != null) {
                                pagedTaskItems(
                                    pagedItems = pagedItems,
                                    selectedTaskId = selectedTask?.id,
                                    onTaskClick = onTaskClick,
                                    userLat = userLat,
                                    userLon = userLon,
                                    groupByDate = true,
                                )
                                if (pagedItems.loadState.append is LoadState.Loading) {
                                    item {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(16.dp),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            CircularProgressIndicator(
                                                modifier = Modifier.size(24.dp),
                                                strokeWidth = 2.dp
                                            )
                                        }
                                    }
                                }
                            } else {
                                listTaskItems(
                                    tasks = tasks,
                                    selectedTaskId = selectedTask?.id,
                                    onTaskClick = onTaskClick,
                                    userLat = userLat,
                                    userLon = userLon,
                                    groupByDate = groupByDate,
                                )
                            }
                        }
                    }
                }
            }
            
            // FAB «наверх» — обновление уже доступно через pull-to-refresh,
            // поэтому прайм-место отдаём быстрому возврату к началу длинного списка.
            val showScrollToTop by remember {
                derivedStateOf { listState.firstVisibleItemIndex > 2 }
            }
            ScrollToTopButton(
                visible = showScrollToTop,
                onClick = { listScope.launch { listState.animateScrollToItem(0) } },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp),
            )
        }
    }
    
    // BottomSheet с деталями
    if (selectedTask != null) {
        TaskDetailBottomSheet(
            task = selectedTask,
            addressDetails = addressDetails,
            isLoadingAddress = isLoadingAddress,
            hasAttemptedAddressLookup = hasAttemptedAddressLookup,
            comments = comments,
            isLoadingComments = isLoadingComments,
            photos = photos,
            isLoadingPhotos = isLoadingPhotos,
            isUploadingPhoto = isUploadingPhoto,
            baseUrl = baseUrl,
            authToken = authToken,
            onDismiss = onTaskDismiss,
            onStatusChange = onStatusChange,
            onOpenObjectCard = onOpenObjectCard,
            onAddComment = { text -> onAddComment(selectedTask.id, text) },
            onAddPhotoClick = onAddPhotoClick,
            onDeletePhoto = onDeletePhoto,
            onPlannedDateChange = onPlannedDateChange?.let { callback ->
                { date -> callback(selectedTask.id, date) }
            },
            onAssignClick = assignment?.onOpen
        )
    }

    if (assignment != null && assignment.showDialog && selectedTask != null) {
        AssigneePickerDialog(
            workers = assignment.workers,
            currentAssigneeId = selectedTask.assignedUserId,
            isLoading = assignment.isLoadingWorkers,
            isAssigning = assignment.isAssigning,
            onAssign = { userId -> assignment.onAssign(selectedTask.id, userId) },
            onDismiss = assignment.onDismiss
        )
    }
    
    // Диалог изменения статуса
    if (showStatusDialog && selectedTask != null) {
        StatusChangeDialog(
            currentStatus = selectedTask.status,
            onDismiss = onHideStatusDialog,
            onStatusSelected = { status, comment ->
                onStatusSelected(selectedTask.id, status, comment)
            }
        )
    }
}

/**
 * Иконка-воронка «фильтр» (официальный Material path). Определена локально, чтобы
 * не тянуть весь material-icons-extended ради одного значка.
 */
private val FilterFunnelIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "FilterList",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(10f, 18f); horizontalLineToRelative(4f); verticalLineToRelative(-2f)
            horizontalLineToRelative(-4f); close()
            moveTo(3f, 6f); verticalLineToRelative(2f); horizontalLineToRelative(18f)
            verticalLineTo(6f); horizontalLineTo(3f); close()
            moveTo(6f, 13f); horizontalLineToRelative(12f); verticalLineToRelative(-2f)
            horizontalLineTo(6f); close()
        }
    }.build()
}

@Composable
fun SearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onToggleFilters: () -> Unit,
    hasActiveFilters: Boolean
) {
    // Локальное состояние для мгновенного отображения ввода
    var localQuery by remember { mutableStateOf(query) }
    
    // Debounce: отправляем изменения с задержкой 300ms
    LaunchedEffect(localQuery) {
        if (localQuery != query) {
            delay(300)
            onQueryChange(localQuery)
        }
    }
    
    // Синхронизация при внешнем изменении (например, очистка)
    LaunchedEffect(query) {
        if (query != localQuery) {
            localQuery = query
        }
    }
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Поле поиска
        Surface(
            modifier = Modifier.weight(1f),
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.Search,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                
                androidx.compose.foundation.text.BasicTextField(
                    value = localQuery,
                    onValueChange = { localQuery = it },
                    textStyle = MaterialTheme.typography.bodyMedium.copy(
                        color = MaterialTheme.colorScheme.onSurface
                    ),
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    decorationBox = { innerTextField ->
                        if (localQuery.isEmpty()) {
                            Text(
                                text = stringResource(id = R.string.search_placeholder),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        innerTextField()
                    }
                )
                
                if (localQuery.isNotEmpty()) {
                    IconButton(
                        onClick = { 
                            localQuery = ""
                            onQueryChange("") 
                        },
                        modifier = Modifier.size(20.dp)
                    ) {
                        Icon(
                            Icons.Default.Clear, 
                            contentDescription = "Очистить",
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }
        
        Spacer(modifier = Modifier.width(6.dp))

        // Кнопка фильтров
        Surface(
            modifier = Modifier.size(38.dp),
            shape = RoundedCornerShape(12.dp),
            color = if (hasActiveFilters)
                MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)
            else
                MaterialTheme.colorScheme.surface,
            border = BorderStroke(
                1.dp,
                if (hasActiveFilters) MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
                else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
            ),
        ) {
            IconButton(onClick = onToggleFilters) {
                BadgedBox(
                    badge = {
                        if (hasActiveFilters) {
                            Badge(
                                containerColor = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(6.dp)
                            ) { }
                        }
                    }
                ) {
                    Icon(
                        FilterFunnelIcon,
                        contentDescription = "Фильтры",
                        modifier = Modifier.size(18.dp),
                        tint = if (hasActiveFilters)
                            MaterialTheme.colorScheme.primary
                        else
                            MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
fun FiltersPanel(
    statusFilter: Set<TaskStatus>,
    onStatusFilterChange: (Set<TaskStatus>) -> Unit,
    sortOrder: com.fieldworker.ui.utils.TaskSortOrder,
    onSortOrderChange: (com.fieldworker.ui.utils.TaskSortOrder) -> Unit,
    onClearFilters: () -> Unit,
    taskScope: TaskScope? = null,
    onTaskScopeChange: (TaskScope) -> Unit = {}
) {
    var scopeExpanded by remember { mutableStateOf(false) }
    var statusExpanded by remember { mutableStateOf(false) }
    var sortExpanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
        ),
        shape = RoundedCornerShape(14.dp)
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            // Заголовок с кнопкой сброса
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "Фильтры",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold
                    )
                    val selectedCount = statusFilter.size +
                        if (taskScope != null && taskScope != TaskScope.ALL) 1 else 0
                    if (selectedCount > 0) {
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.primaryContainer
                        ) {
                            Text(
                                text = selectedCount.toString(),
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
                TextButton(
                    onClick = onClearFilters,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                ) {
                    Text("Сбросить", style = MaterialTheme.typography.labelMedium)
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            if (taskScope != null) {
                FilterDropdownRow(
                    title = "Заявки",
                    summary = taskScope.displayName,
                    expanded = scopeExpanded,
                    onExpandedChange = { scopeExpanded = it }
                ) {
                    TaskScope.entries.forEach { scope ->
                        DropdownMenuItem(
                            text = { Text(scope.displayName) },
                            onClick = {
                                onTaskScopeChange(scope)
                                scopeExpanded = false
                            },
                            trailingIcon = {
                                if (scope == taskScope) {
                                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                                }
                            }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
            }

            FilterDropdownRow(
                title = "Статус",
                summary = formatFilterSummary(
                    selectedCount = statusFilter.size,
                    allCount = TaskStatus.entries.count { it != TaskStatus.UNKNOWN },
                    selectedLabels = TaskStatus.entries
                        .filter { it != TaskStatus.UNKNOWN && it in statusFilter }
                        .map { it.displayName }
                ),
                expanded = statusExpanded,
                onExpandedChange = { statusExpanded = it }
            ) {
                TaskStatus.entries.filter { it != TaskStatus.UNKNOWN }.forEach { status ->
                    DropdownMenuItem(
                        text = { Text(status.displayName) },
                        onClick = {
                            val newFilter = if (status in statusFilter) {
                                statusFilter - status
                            } else {
                                statusFilter + status
                            }
                            onStatusFilterChange(newFilter)
                        },
                        trailingIcon = {
                            if (status in statusFilter) {
                                Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                            }
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            FilterDropdownRow(
                title = "Сортировка",
                summary = sortOrder.displayName,
                expanded = sortExpanded,
                onExpandedChange = { sortExpanded = it }
            ) {
                com.fieldworker.ui.utils.TaskSortOrder.entries.forEach { order ->
                    DropdownMenuItem(
                        text = { Text(order.displayName) },
                        onClick = {
                            onSortOrderChange(order)
                            sortExpanded = false
                        },
                        trailingIcon = {
                            if (order == sortOrder) {
                                Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun FilterDropdownRow(
    title: String,
    summary: String,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    Box(modifier = Modifier.fillMaxWidth()) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onExpandedChange(!expanded) }
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = summary,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1
                    )
                    Icon(
                        imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { onExpandedChange(false) },
            modifier = Modifier.fillMaxWidth(0.92f)
        ) {
            content()
        }
    }
}

private fun formatFilterSummary(
    selectedCount: Int,
    allCount: Int,
    selectedLabels: List<String>
): String {
    return when {
        selectedCount == 0 || selectedCount == allCount -> "Все"
        selectedCount <= 2 -> selectedLabels.joinToString(", ")
        else -> "Выбрано: $selectedCount"
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailBottomSheet(
    task: Task,
    addressDetails: AddressDetails? = null,
    isLoadingAddress: Boolean = false,
    hasAttemptedAddressLookup: Boolean = false,
    comments: List<Comment>,
    isLoadingComments: Boolean,
    photos: List<TaskPhoto> = emptyList(),
    isLoadingPhotos: Boolean = false,
    isUploadingPhoto: Boolean = false,
    baseUrl: String = "",
    authToken: String? = null,
    onDismiss: () -> Unit,
    onStatusChange: () -> Unit,
    onOpenObjectCard: () -> Unit = {},
    onAddComment: (String) -> Unit,
    onAddPhotoClick: () -> Unit = {},
    onDeletePhoto: (Long) -> Unit = {},
    onPlannedDateChange: ((String?) -> Unit)? = null,
    onAssignClick: (() -> Unit)? = null
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.background // Светло-серый фон как на референсе
    ) {
        TaskDetailContent(
            task = task,
            addressDetails = addressDetails,
            isLoadingAddress = isLoadingAddress,
            hasAttemptedAddressLookup = hasAttemptedAddressLookup,
            comments = comments,
            isLoadingComments = isLoadingComments,
            photos = photos,
            isLoadingPhotos = isLoadingPhotos,
            isUploadingPhoto = isUploadingPhoto,
            baseUrl = baseUrl,
            authToken = authToken,
            onStatusChange = onStatusChange,
            onOpenObjectCard = onOpenObjectCard,
            onAddComment = onAddComment,
            onAddPhotoClick = onAddPhotoClick,
            onDeletePhoto = onDeletePhoto,
            onPlannedDateChange = onPlannedDateChange,
            onAssignClick = onAssignClick
        )
    }
}

/**
 * Содержимое карточки заявки без оболочки шторки — отдельно, чтобы рендериться
 * в превью и скриншот-тестах (окно ModalBottomSheet Robolectric не рисует).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailContent(
    task: Task,
    addressDetails: AddressDetails? = null,
    isLoadingAddress: Boolean = false,
    hasAttemptedAddressLookup: Boolean = false,
    comments: List<Comment>,
    isLoadingComments: Boolean,
    photos: List<TaskPhoto> = emptyList(),
    isLoadingPhotos: Boolean = false,
    isUploadingPhoto: Boolean = false,
    baseUrl: String = "",
    authToken: String? = null,
    onStatusChange: () -> Unit,
    onOpenObjectCard: () -> Unit = {},
    onAddComment: (String) -> Unit,
    onAddPhotoClick: () -> Unit = {},
    onDeletePhoto: (Long) -> Unit = {},
    onPlannedDateChange: ((String?) -> Unit)? = null,
    onAssignClick: (() -> Unit)? = null
) {
    var commentText by remember { mutableStateOf("") }
    val context = LocalContext.current
    
    // Состояния для спойлеров
    var isPhotosExpanded by remember { mutableStateOf(false) }
    var isHistoryExpanded by remember { mutableStateOf(false) }
    
    // Состояние для выбора даты
    var showDatePicker by remember { mutableStateOf(false) }
    
    // Извлекаем данные из задачи
    val phoneNumber = remember(task) {
        task.customerPhone?.takeIf { it.isNotBlank() }
            ?: extractPhoneNumber(task.title)
            ?: extractPhoneNumber(task.description)
    }
    val customerName = remember(task) { task.customerName?.takeIf { it.isNotBlank() } }
    val assignedUserName = remember(task) { task.assignedUserName?.takeIf { it.isNotBlank() } }
    val apartment = remember(task) {
        extractApartment(task.title) ?: extractApartment(task.description)
    }
    val additionalInfo = remember(task) {
        extractAdditionalInfo(task)
    }
    // Описание уже стоит заголовком (как в ленте) — не повторяем его отдельным блоком
    val showDescription = remember(task, additionalInfo) {
        val text = (additionalInfo ?: task.description).trim()
        val headline = com.fieldworker.ui.components.taskHeadline(task, task.getDisplayNumber())
        text.isNotBlank() && text.trimEnd('.') != headline.trim().trimEnd('.')
    }
    
    // Форматированная дата создания
    val formattedDate = remember(task.createdAt) {
        com.fieldworker.ui.utils.TaskUtils.formatShortDate(task.createdAt)
    }
    
    // Форматированная планируемая дата
    val formattedPlannedDate = remember(task.plannedDate) {
        task.plannedDate?.let { com.fieldworker.ui.utils.TaskUtils.formatShortDate(it) }
    }
    
    val accentColor = MaterialTheme.colorScheme.primary
    
    // Сортируем комментарии от новых к старым
    val sortedComments = remember(comments) {
        comments.sortedByDescending { it.createdAt }
    }
    
    // Последние 3 комментария видны сразу, остальные под спойлером
    val visibleComments = sortedComments.take(3)
    val hiddenComments = sortedComments.drop(3)
    
    // DatePicker диалог
    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = task.plannedDate?.let {
                try {
                    java.time.LocalDate.parse(it.substringBefore("T")).toEpochDay() * 86400000
                } catch (e: Exception) { null }
            }
        )
        
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis?.let { millis ->
                            val date = java.time.Instant.ofEpochMilli(millis)
                                .atZone(java.time.ZoneId.systemDefault())
                                .toLocalDate()
                            onPlannedDateChange?.invoke(date.toString())
                        }
                        showDatePicker = false
                    }
                ) {
                    Text("Применить")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text("Отмена")
                }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
    
    val openNavigation = {
        if (task.hasValidCoordinates()) {
            com.fieldworker.ui.utils.TaskUtils.openNavigation(context, task)
        } else {
            Toast.makeText(context, "Координаты не указаны", Toast.LENGTH_SHORT).show()
        }
    }
    val dialPhone: (() -> Unit)? = phoneNumber?.let { phone ->
        {
            val intent = Intent(Intent.ACTION_DIAL).apply {
                data = Uri.parse("tel:${normalizePhoneForDial(phone)}")
            }
            context.startActivity(intent)
        }
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f, fill = false)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                TaskDetailHeader(task = task, onStatusChange = onStatusChange)
            }

            item {
                TaskFactsCard(
                    task = task,
                    formattedDate = formattedDate,
                    formattedPlannedDate = formattedPlannedDate,
                    apartment = apartment,
                    customerName = customerName,
                    phoneNumber = phoneNumber,
                    assignedUserName = assignedUserName,
                    onAssignClick = onAssignClick,
                    onPlannedDateClick = if (onPlannedDateChange != null) {
                        { showDatePicker = true }
                    } else {
                        null
                    },
                    onOpenNavigation = openNavigation,
                    onDialPhone = dialPhone
                )
            }

            if (showDescription) {
                item {
                    TaskDescriptionSection(
                        description = additionalInfo ?: task.description
                    )
                }
            }

            if (isLoadingAddress || addressDetails != null || hasAttemptedAddressLookup) {
                item {
                    TaskObjectPreviewSection(
                        addressDetails = addressDetails,
                        isLoading = isLoadingAddress,
                        hasAttemptedLookup = hasAttemptedAddressLookup,
                        onOpenObjectCard = onOpenObjectCard
                    )
                }
            }

            item {
                TaskPhotosSection(
                    photos = photos,
                    isExpanded = isPhotosExpanded,
                    isLoadingPhotos = isLoadingPhotos,
                    isUploadingPhoto = isUploadingPhoto,
                    accentColor = accentColor,
                    baseUrl = baseUrl,
                    authToken = authToken,
                    onToggleExpanded = { isPhotosExpanded = !isPhotosExpanded },
                    onAddPhotoClick = onAddPhotoClick,
                    onDeletePhoto = onDeletePhoto
                )
            }

            item {
                TaskCommentComposer(
                    commentText = commentText,
                    accentColor = accentColor,
                    onCommentTextChange = { commentText = it },
                    onSubmit = {
                        if (commentText.isNotBlank()) {
                            onAddComment(commentText)
                            commentText = ""
                        }
                    }
                )
            }

            item {
                TaskHistorySection(
                    visibleComments = visibleComments,
                    hiddenComments = hiddenComments,
                    photos = photos,
                    isLoadingComments = isLoadingComments,
                    isExpanded = isHistoryExpanded,
                    accentColor = accentColor,
                    onToggleExpanded = { isHistoryExpanded = !isHistoryExpanded }
                )
            }

            item {
                Spacer(modifier = Modifier.height(16.dp))
            }
        }

        TaskActionBar(
            status = task.status,
            onDialPhone = dialPhone,
            onOpenNavigation = openNavigation,
            onStatusChange = onStatusChange
        )
    }
}

@Composable
private fun TaskObjectPreviewSection(
    addressDetails: AddressDetails?,
    isLoading: Boolean,
    hasAttemptedLookup: Boolean,
    onOpenObjectCard: () -> Unit
) {
    TaskSectionCard(
        title = "Объект",
        action = {
            when {
                isLoading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.size(14.dp),
                        strokeWidth = 2.dp
                    )
                }

                addressDetails != null -> {
                    TextButton(onClick = onOpenObjectCard) {
                        Text("Открыть")
                    }
                }
            }
        }
    ) {
        when {
            isLoading -> {
                Text(
                    text = "Собираем карточку объекта по адресу заявки...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            addressDetails != null -> {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    DetailInfoRow(
                        icon = Icons.Default.Home,
                        label = "Адрес",
                        value = addressDetails.address
                    )

                    val summary = buildList {
                        if (addressDetails.systems.isNotEmpty()) add("систем: ${addressDetails.systems.size}")
                        if (addressDetails.equipment.isNotEmpty()) add("оборудования: ${addressDetails.equipment.sumOf { it.quantity }}")
                        if (addressDetails.documents.isNotEmpty()) add("документов: ${addressDetails.documents.size}")
                        addressDetails.managementCompany?.takeIf { it.isNotBlank() }?.let { add(it) }
                    }.joinToString(" • ")

                    if (summary.isNotBlank()) {
                        Text(
                            text = summary,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    FilledTonalButton(onClick = onOpenObjectCard) {
                        Text("Открыть карточку объекта")
                    }
                }
            }

            hasAttemptedLookup -> {
                Text(
                    text = "Объект для этого адреса не найден в адресной базе.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/**
 * Шапка карточки: статус + приоритет + номер одной строкой, ниже суть заявки.
 * Номер показываем один раз — он же убран из заголовка.
 */
@Composable
private fun TaskDetailHeader(
    task: Task,
    onStatusChange: () -> Unit
) {
    val displayNumber = remember(task) { task.getDisplayNumber() }
    // Тот же заголовок, что в ленте, — иначе одна заявка выглядит как две разные
    val title = remember(task) { com.fieldworker.ui.components.taskHeadline(task, displayNumber) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            StatusPill(status = task.status, onClick = onStatusChange)
            if (task.priority == Priority.EMERGENCY || task.priority == Priority.URGENT) {
                val color = task.priority.contentColor()
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    if (task.priority == Priority.EMERGENCY) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = null,
                            tint = color,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                    Text(
                        text = task.priority.displayName,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = color
                    )
                }
            }
            Spacer(modifier = Modifier.weight(1f))
            Text(
                text = "#$displayNumber",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

/** Чип статуса; нажатие открывает смену статуса (в т.ч. отмену). */
@Composable
private fun StatusPill(status: TaskStatus, onClick: () -> Unit) {
    val color by animateColorAsState(status.contentColor(), label = "status-color")
    val container by animateColorAsState(status.containerColor(), label = "status-container")
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(container)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 5.dp)
    ) {
        Box(
            modifier = Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(color)
        )
        Text(
            text = status.displayName,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = color
        )
    }
}

@Composable
private fun TaskSectionCard(
    title: String,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                action?.invoke()
            }
            Spacer(modifier = Modifier.height(14.dp))
            content()
        }
    }
}

@Composable
private fun SheetHeaderChip(text: String) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
        )
    }
}

/** Мелкий приглушённый лейбл над значением (eyebrow, как в портале). */
@Composable
private fun Eyebrow(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        letterSpacing = 0.6.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

private data class TaskFact(
    val label: String,
    val value: String,
    val onClick: (() -> Unit)? = null,
    val isPlaceholder: Boolean = false,
)

/**
 * Факты заявки одной плоской карточкой: адрес на всю ширину (тап — маршрут),
 * остальное сеткой в две колонки. Кликабельные значения — акцентным цветом.
 */
@Composable
private fun TaskFactsCard(
    task: Task,
    formattedDate: String,
    formattedPlannedDate: String?,
    apartment: String?,
    customerName: String?,
    phoneNumber: String?,
    assignedUserName: String?,
    onAssignClick: (() -> Unit)?,
    onPlannedDateClick: (() -> Unit)?,
    onOpenNavigation: () -> Unit,
    onDialPhone: (() -> Unit)?
) {
    val facts = buildList {
        customerName?.let { add(TaskFact("Клиент", it)) }
        phoneNumber?.let { add(TaskFact("Телефон", formatPhoneForDisplay(it), onDialPhone)) }
        add(TaskFact("Создана", formattedDate))
        add(
            TaskFact(
                label = "Срок",
                value = formattedPlannedDate ?: if (onPlannedDateClick != null) "Установить" else "Не задан",
                onClick = onPlannedDateClick,
                isPlaceholder = formattedPlannedDate == null
            )
        )
        if (onAssignClick != null || assignedUserName != null) {
            add(
                TaskFact(
                    label = "Исполнитель",
                    value = assignedUserName ?: "Назначить",
                    onClick = onAssignClick,
                    isPlaceholder = assignedUserName == null
                )
            )
        }
        if (task.isPaid) {
            add(
                TaskFact(
                    label = "Оплата",
                    value = if (task.paymentAmount > 0.0) "${"%.0f".format(task.paymentAmount)} ₽" else "Платная"
                )
            )
        }
        task.systemType?.takeIf { it.isNotBlank() }?.let { add(TaskFact("Система", it)) }
        task.defectType?.takeIf { it.isNotBlank() }?.let { add(TaskFact("Неисправность", it)) }
        if (task.isRemote) add(TaskFact("Формат", "Удалённо"))
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onOpenNavigation),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Eyebrow("Адрес")
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = task.address + (apartment?.let { ", кв. $it" } ?: ""),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = "Маршрут",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            facts.chunked(2).forEach { row ->
                Spacer(modifier = Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    row.forEach { fact -> FactCell(fact = fact, modifier = Modifier.weight(1f)) }
                    if (row.size == 1) Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun FactCell(fact: TaskFact, modifier: Modifier = Modifier) {
    val valueColor = when {
        fact.onClick != null -> MaterialTheme.colorScheme.primary
        fact.isPlaceholder -> MaterialTheme.colorScheme.onSurfaceVariant
        else -> MaterialTheme.colorScheme.onSurface
    }
    Column(
        modifier = modifier
            .then(if (fact.onClick != null) Modifier.clickable(onClick = fact.onClick) else Modifier)
    ) {
        Eyebrow(fact.label)
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = fact.value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = valueColor
        )
    }
}

/**
 * Закреплённая панель главных действий: звонок, маршрут и следующий шаг по
 * статусу (большая кнопка под пальцем). Для закрытых заявок — без кнопки статуса.
 */
@Composable
private fun TaskActionBar(
    status: TaskStatus,
    onDialPhone: (() -> Unit)?,
    onOpenNavigation: () -> Unit,
    onStatusChange: () -> Unit
) {
    val nextActionLabel = when (status) {
        TaskStatus.NEW -> "Взять в работу"
        TaskStatus.IN_PROGRESS -> "Завершить"
        else -> null
    }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 8.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            val secondaryActionColors = IconButtonDefaults.filledTonalIconButtonColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f),
                contentColor = MaterialTheme.colorScheme.onSurface
            )
            if (onDialPhone != null) {
                FilledTonalIconButton(
                    onClick = onDialPhone,
                    colors = secondaryActionColors,
                    modifier = Modifier.size(52.dp)
                ) {
                    Icon(Icons.Default.Phone, contentDescription = "Позвонить")
                }
            }
            FilledTonalIconButton(
                onClick = onOpenNavigation,
                colors = secondaryActionColors,
                modifier = Modifier.size(52.dp)
            ) {
                Icon(Icons.Default.LocationOn, contentDescription = "Маршрут")
            }
            if (nextActionLabel != null) {
                Button(
                    onClick = onStatusChange,
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp)
                ) {
                    // «Взять в работу» → «Завершить» — перетекание, а не подмена
                    AnimatedContent(
                        targetState = nextActionLabel,
                        transitionSpec = {
                            (fadeIn() + slideInVertically { it / 2 }) togetherWith
                                (fadeOut() + slideOutVertically { -it / 2 })
                        },
                        label = "next-action"
                    ) { label ->
                        Text(label, style = MaterialTheme.typography.titleSmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun TaskDescriptionSection(description: String) {
    TaskSectionCard(title = "Описание работ") {
        Text(
            text = description,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun TaskPhotosSection(
    photos: List<TaskPhoto>,
    isExpanded: Boolean,
    isLoadingPhotos: Boolean,
    isUploadingPhoto: Boolean,
    accentColor: Color,
    baseUrl: String,
    authToken: String?,
    onToggleExpanded: () -> Unit,
    onAddPhotoClick: () -> Unit,
    onDeletePhoto: (Long) -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .animateContentSize()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggleExpanded)
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.ic_camera),
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(20.dp)
                    )
                    Text(
                        text = "Фотографии",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    if (photos.isNotEmpty()) {
                        SheetHeaderChip(text = photos.size.toString())
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (isLoadingPhotos) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = accentColor
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Icon(
                        imageVector = if (isExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            AnimatedVisibility(visible = isExpanded) {
                Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
                    PhotoGallery(
                        photos = photos,
                        isLoading = isLoadingPhotos,
                        isUploading = isUploadingPhoto,
                        baseUrl = baseUrl,
                        authToken = authToken,
                        onAddPhotoClick = onAddPhotoClick,
                        onDeletePhoto = onDeletePhoto
                    )
                }
            }
        }
    }
}

@Composable
private fun TaskCommentComposer(
    commentText: String,
    accentColor: Color,
    onCommentTextChange: (String) -> Unit,
    onSubmit: () -> Unit
) {
    TaskSectionCard(title = "Комментарий") {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            androidx.compose.foundation.text.BasicTextField(
                value = commentText,
                onValueChange = onCommentTextChange,
                modifier = Modifier
                    .weight(1f)
                    .height(44.dp)
                    .background(Color.Transparent, RoundedCornerShape(22.dp))
                    .border(
                        width = 1.dp,
                        color = if (commentText.isNotEmpty()) accentColor else MaterialTheme.colorScheme.outline,
                        shape = RoundedCornerShape(22.dp)
                    ),
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(
                    color = MaterialTheme.colorScheme.onSurface
                ),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(accentColor),
                decorationBox = { innerTextField ->
                    Box(
                        contentAlignment = Alignment.CenterStart,
                        modifier = Modifier.padding(horizontal = 16.dp)
                    ) {
                        if (commentText.isEmpty()) {
                            Text(
                                text = "Добавить заметку по работе",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        innerTextField()
                    }
                }
            )
            Spacer(modifier = Modifier.width(8.dp))
            FilledIconButton(
                onClick = onSubmit,
                enabled = commentText.isNotBlank(),
                modifier = Modifier.size(44.dp),
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = accentColor,
                    contentColor = MaterialTheme.colorScheme.surface,
                    disabledContainerColor = Color.Gray.copy(alpha = 0.3f)
                )
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_send),
                    contentDescription = "Отправить",
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

@Composable
private fun TaskHistorySection(
    visibleComments: List<Comment>,
    hiddenComments: List<Comment>,
    photos: List<TaskPhoto>,
    isLoadingComments: Boolean,
    isExpanded: Boolean,
    accentColor: Color,
    onToggleExpanded: () -> Unit
) {
    val photoEvents = remember(photos) {
        photos.map { photo ->
            Comment(
                id = Long.MIN_VALUE + photo.id,
                taskId = photo.taskId,
                text = "Добавлено фото: ${photo.getPhotoTypeDisplayName()}",
                author = photo.uploadedBy ?: "Сотрудник",
                oldStatus = null,
                newStatus = null,
                createdAt = photo.createdAt
            )
        }
    }
    val timelineComments = remember(visibleComments, hiddenComments, photoEvents) {
        (visibleComments + hiddenComments + photoEvents).sortedByDescending { it.createdAt }
    }
    val visibleTimeline = timelineComments.take(3)
    val hiddenTimeline = timelineComments.drop(3)

    TaskSectionCard(
        title = "Лента работ",
        action = {
            if (isLoadingComments) {
                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
            }
        }
    ) {
        if (timelineComments.isEmpty() && !isLoadingComments) {
            Text(
                text = "Пока нет записей",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            visibleTimeline.forEachIndexed { index, comment ->
                HistoryTimelineItem(
                    comment = comment,
                    isLast = index == visibleTimeline.lastIndex && hiddenTimeline.isEmpty() && !isExpanded
                )
            }

            if (hiddenTimeline.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .clickable(onClick = onToggleExpanded)
                        .background(MaterialTheme.colorScheme.background)
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (isExpanded) "Скрыть" else "Показать ещё ${hiddenTimeline.size}",
                        style = MaterialTheme.typography.labelMedium,
                        color = accentColor,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(
                        imageVector = if (isExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(18.dp)
                    )
                }

                AnimatedVisibility(visible = isExpanded) {
                    Column {
                        Spacer(modifier = Modifier.height(12.dp))
                        hiddenTimeline.forEachIndexed { index, comment ->
                            HistoryTimelineItem(
                                comment = comment,
                                isLast = index == hiddenTimeline.lastIndex
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailInfoRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    onClick: (() -> Unit)? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .clickable(enabled = onClick != null) { onClick?.invoke() }
            .padding(horizontal = 4.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Surface(
            modifier = Modifier.size(36.dp),
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp)
                )
            }
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Medium
            )
        }

        if (onClick != null) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

/**
 * Элемент таймлайна истории (как в референсе)
 */
@Composable
private fun HistoryTimelineItem(
    comment: Comment,
    isLast: Boolean
) {
    val statusColor = comment.newStatus?.contentColor() ?: MaterialTheme.colorScheme.primary

    val formattedDate = remember(comment.createdAt) {
        com.fieldworker.ui.utils.TaskUtils.formatShortDate(comment.createdAt)
    }

    val formattedTime = remember(comment.createdAt) {
        com.fieldworker.ui.utils.TaskUtils.formatShortTime(comment.createdAt)
    }
    
    Row(
        modifier = Modifier.fillMaxWidth()
    ) {
        // Точка таймлайна + линия
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.width(24.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .background(statusColor, CircleShape)
            )
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(40.dp)
                        .background(MaterialTheme.colorScheme.outlineVariant)
                )
            }
        }
        
        Spacer(modifier = Modifier.width(12.dp))
        
        // Контент
        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                text = comment.text,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = "$formattedDate $formattedTime",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (!isLast) {
                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

/**
 * FAB «наверх» с анимацией появления. Вынесен в отдельный composable, чтобы
 * [AnimatedVisibility] резолвился в top-level overload, а не в scoped-версию
 * из внешних Column/Box (иначе конфликт implicit receiver).
 */
@Composable
private fun ScrollToTopButton(
    visible: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier,
    ) {
        FloatingActionButton(
            onClick = onClick,
            containerColor = MaterialTheme.colorScheme.primary,
        ) {
            Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Наверх")
        }
    }
}

@Composable
fun EmptyState(
    message: String,
    isFiltered: Boolean = false,
    onReset: (() -> Unit)? = null
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = if (isFiltered) Icons.Default.Search else Icons.Default.CheckCircle,
                contentDescription = null,
                modifier = Modifier.size(56.dp),
                // Пустое состояние — спокойный нейтрал, акцент только для действий
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = if (isFiltered) {
                    "Попробуйте изменить параметры поиска"
                } else {
                    "Новые заявки появятся здесь автоматически"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                textAlign = TextAlign.Center
            )
            if (isFiltered && onReset != null) {
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedButton(onClick = onReset) {
                    Text("Сбросить фильтры")
                }
            }
        }
    }
}

/**
 * Skeleton loading для карточки задачи (strict стиль).
 */
@Composable
fun TaskListItemSkeleton() {
    val infiniteTransition = rememberInfiniteTransition(label = "skeleton")
    val shimmerTranslate by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmer"
    )

    val shimmerBrush = Brush.linearGradient(
        colors = listOf(
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.20f),
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
        ),
        start = Offset(shimmerTranslate - 200f, 0f),
        end = Offset(shimmerTranslate, 0f)
    )

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
    ) {
        Row(modifier = Modifier.height(IntrinsicSize.Min)) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(4.dp)
                    .background(shimmerBrush)
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.55f)
                        .height(12.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(shimmerBrush)
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.85f)
                        .height(14.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(shimmerBrush)
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.7f)
                        .height(12.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(shimmerBrush)
                )
            }
        }
    }
}

/**
 * Список skeleton-элементов для загрузки
 */
@Composable
fun TaskListSkeleton(count: Int = 6) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 12.dp,
            end = 12.dp,
            top = 6.dp,
            bottom = 80.dp
        ),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        items(count) {
            TaskListItemSkeleton()
        }
    }
}

@Composable
private fun TaskGroupHeader(label: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            letterSpacing = 0.8.sp,
            modifier = Modifier.padding(start = 4.dp, top = 8.dp, bottom = 4.dp),
        )
    }
}

private fun LazyListScope.listTaskItems(
    tasks: List<Task>,
    selectedTaskId: Long?,
    onTaskClick: (Task) -> Unit,
    userLat: Double?,
    userLon: Double?,
    groupByDate: Boolean,
) {
    if (!groupByDate) {
        items(tasks, key = { it.id }, contentType = { "task_card" }) { task ->
            TaskCard(
                task = task,
                isSelected = selectedTaskId == task.id,
                onClick = { onTaskClick(task) },
                userLat = userLat,
                userLon = userLon,
                // Смена статуса/фильтра/сортировки — карточки переезжают, а не прыгают
                modifier = Modifier.animateItem(),
            )
        }
        return
    }

    var previousBucket: com.fieldworker.ui.utils.TaskUtils.DateBucket? = null
    tasks.forEachIndexed { index, task ->
        val bucket = com.fieldworker.ui.utils.TaskUtils.dateBucket(task.createdAt)
        if (bucket != previousBucket) {
            stickyHeader(key = "h:$index:${bucket.name}") {
                TaskGroupHeader(bucket.label)
            }
            previousBucket = bucket
        }
        item(key = task.id, contentType = "task_card") {
            TaskCard(
                task = task,
                isSelected = selectedTaskId == task.id,
                onClick = { onTaskClick(task) },
                userLat = userLat,
                userLon = userLon,
                // Смена статуса/фильтра/сортировки — карточки переезжают, а не прыгают
                modifier = Modifier.animateItem(),
            )
        }
    }
}

private fun LazyListScope.pagedTaskItems(
    pagedItems: LazyPagingItems<Task>,
    selectedTaskId: Long?,
    onTaskClick: (Task) -> Unit,
    userLat: Double?,
    userLon: Double?,
    groupByDate: Boolean,
) {
    var previousBucket: com.fieldworker.ui.utils.TaskUtils.DateBucket? = null
    for (index in 0 until pagedItems.itemCount) {
        val peeked = pagedItems.peek(index)
        if (groupByDate && peeked != null) {
            val bucket = com.fieldworker.ui.utils.TaskUtils.dateBucket(peeked.createdAt)
            if (bucket != previousBucket) {
                stickyHeader(key = "h:$index:${bucket.name}") {
                    TaskGroupHeader(bucket.label)
                }
                previousBucket = bucket
            }
        }
        item(key = peeked?.id ?: ("placeholder:$index")) {
            val task = pagedItems[index]
            if (task != null) {
                TaskCard(
                    task = task,
                    isSelected = selectedTaskId == task.id,
                    onClick = { onTaskClick(task) },
                    userLat = userLat,
                    userLon = userLon,
                    modifier = Modifier.animateItem(),
                )
            }
        }
    }
}
