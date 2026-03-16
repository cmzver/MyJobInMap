@file:OptIn(ExperimentalMaterial3Api::class)

package com.fieldworker.ui.list

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.HapticFeedbackConstants
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
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
import com.fieldworker.ui.map.PriorityBadge
import com.fieldworker.ui.map.StatusChangeDialog
import com.fieldworker.ui.map.toColor
import com.fieldworker.ui.map.toIcon
import kotlinx.coroutines.delay

/**
 * Извлекает номер телефона из текста
 */
fun extractPhoneNumber(text: String): String? {
    // Ищем телефон в формате +7XXXXXXXXXX или 8XXXXXXXXXX
    val phoneRegex = Regex("""\+?[78]\d{10}""")
    return phoneRegex.find(text)?.value
}

/**
 * Извлекает номер квартиры из текста
 */
fun extractApartment(text: String): String? {
    val aptRegex = Regex("""(?:кв\.?\s*|квартира\s*)(\d+)""", RegexOption.IGNORE_CASE)
    return aptRegex.find(text)?.groupValues?.get(1)
}

/**
 * Извлекает дополнительную информацию из описания
 * (всё после адреса и базовой информации)
 */
fun extractAdditionalInfo(task: Task): String? {
    val description = task.description
    if (description.isBlank()) return null
    
    // Убираем телефон и квартиру из описания, оставляем остальное
    var additionalInfo = description
    
    // Убираем телефон
    additionalInfo = additionalInfo.replace(Regex("""\+?[78]\d{10}"""), "")
    
    // Убираем квартиру
    additionalInfo = additionalInfo.replace(Regex("""(?:кв\.?\s*|квартира\s*)\d+""", RegexOption.IGNORE_CASE), "")
    
    // Убираем лишние пробелы и запятые
    additionalInfo = additionalInfo.replace(Regex("""\s*,\s*,\s*"""), ", ")
        .replace(Regex("""^\s*,\s*"""), "")
        .replace(Regex("""\s*,\s*$"""), "")
        .trim()
    
    return additionalInfo.ifBlank { null }
}

private fun normalizePhoneForDial(phone: String): String {
    val compactPhone = phone.replace(Regex("""[^+\d]"""), "")
    return when {
        compactPhone.startsWith("8") && compactPhone.length == 11 -> "+7${compactPhone.drop(1)}"
        compactPhone.startsWith("+") -> compactPhone
        compactPhone.isNotBlank() -> "+$compactPhone"
        else -> compactPhone
    }
}

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
    onPlannedDateChange: ((Long, String?) -> Unit)? = null
) {
    var showFilters by remember { mutableStateOf(false) }
    val hasActiveFilters = statusFilter.isNotEmpty()
    val hasSearchQuery = searchQuery.isNotBlank()
    val hasLocalTransforms = hasActiveFilters || hasSearchQuery || sortOrder != com.fieldworker.ui.utils.TaskSortOrder.BY_DATE_DESC
    
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
                onClearFilters = {
                    onStatusFilterChange(emptySet())
                }
            )
        }
        
        // Счётчик результатов + сортировка
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            val displayCount = tasks.size
            Text(
                text = "Найдено: $displayCount",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f)
            )
            
            if (isLoading && tasks.isNotEmpty()) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
            }
        }
        
        // Список задач с FAB и Pull-to-Refresh
        Box(modifier = Modifier.weight(1f)) {
            val hasFilters = hasSearchQuery || hasActiveFilters
            val activePagingItems = pagingItems?.takeIf { !hasLocalTransforms }
            
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
                        message = if (hasFilters) "Задачи не найдены" else "Нет задач",
                        isFiltered = hasFilters
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
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(
                                start = 16.dp,
                                end = 16.dp,
                                top = 8.dp,
                                bottom = 80.dp  // Отступ для FAB
                            ),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            val pagedItems = activePagingItems
                            if (pagedItems != null) {
                                // Paging 3: постраничная загрузка из Room
                                items(
                                    count = pagedItems.itemCount,
                                    key = { index -> pagedItems[index]?.id ?: index }
                                ) { index ->
                                    val task = pagedItems[index]
                                    if (task != null) {
                                        TaskCard(
                                            task = task,
                                            isSelected = selectedTask?.id == task.id,
                                            onClick = { onTaskClick(task) },
                                            userLat = userLat,
                                            userLon = userLon
                                        )
                                    }
                                }
                                
                                // Индикатор подгрузки следующей страницы
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
                                // Fallback: обычный список
                                items(tasks, key = { it.id }) { task ->
                                    TaskCard(
                                        task = task,
                                        isSelected = selectedTask?.id == task.id,
                                        onClick = { onTaskClick(task) },
                                        userLat = userLat,
                                        userLon = userLon
                                    )
                                }
                            }
                        }
                    }
                }
            }
            
            // FAB для обновления
            FloatingActionButton(
                onClick = onRefresh,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp),
                containerColor = MaterialTheme.colorScheme.primary
            ) {
                Icon(Icons.Default.Refresh, contentDescription = "Обновить")
            }
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
            }
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
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Поле поиска
        Surface(
            modifier = Modifier.weight(1f),
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
            tonalElevation = 0.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.Search,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                
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
        
        Spacer(modifier = Modifier.width(8.dp))
        
        // Кнопка фильтров
        Surface(
            shape = CircleShape,
            color = if (hasActiveFilters) 
                MaterialTheme.colorScheme.primaryContainer 
            else 
                MaterialTheme.colorScheme.surface,
            tonalElevation = 2.dp
        ) {
            IconButton(onClick = onToggleFilters) {
                BadgedBox(
                    badge = {
                        if (hasActiveFilters) {
                            Badge(
                                containerColor = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(8.dp)
                            ) { }
                        }
                    }
                ) {
                    Icon(
                        Icons.Default.Settings,
                        contentDescription = "Фильтры",
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
    onClearFilters: () -> Unit
) {
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
                    val selectedCount = statusFilter.size
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
    onPlannedDateChange: ((String?) -> Unit)? = null
) {
    var commentText by remember { mutableStateOf("") }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
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
    
    // Форматированная дата создания
    val formattedDate = remember(task.createdAt) {
        com.fieldworker.ui.utils.TaskUtils.formatShortDate(task.createdAt)
    }
    
    // Форматированная планируемая дата
    val formattedPlannedDate = remember(task.plannedDate) {
        task.plannedDate?.let { com.fieldworker.ui.utils.TaskUtils.formatShortDate(it) }
    }
    
    // Цвета приоритета
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
    
    // Оранжевый для акцентов
    val orangeAccent = MaterialTheme.colorScheme.primary
    
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
    
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.background // Светло-серый фон как на референсе
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                TaskDetailHeader(
                    task = task,
                    commentsCount = sortedComments.size,
                    photosCount = photos.size
                )
            }

            item {
                TaskSummaryCard(
                    task = task,
                    formattedDate = formattedDate,
                    formattedPlannedDate = formattedPlannedDate,
                    apartment = apartment,
                    customerName = customerName,
                    phoneNumber = phoneNumber,
                    assignedUserName = assignedUserName,
                    priorityColor = priorityColor,
                    priorityBgColor = priorityBgColor,
                    orangeAccent = orangeAccent,
                    onStatusChange = onStatusChange,
                    onPlannedDateClick = if (onPlannedDateChange != null) {
                        { showDatePicker = true }
                    } else {
                        null
                    },
                    onOpenNavigation = {
                        if (task.hasValidCoordinates()) {
                            com.fieldworker.ui.utils.TaskUtils.openNavigation(context, task)
                        } else {
                            Toast.makeText(context, "Координаты не указаны", Toast.LENGTH_SHORT).show()
                        }
                    },
                    onDialPhone = phoneNumber?.let { phone ->
                        {
                            val intent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:${normalizePhoneForDial(phone)}")
                            }
                            context.startActivity(intent)
                        }
                    }
                )
            }

            if (additionalInfo != null || task.description.isNotBlank()) {
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
                    orangeAccent = orangeAccent,
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
                    orangeAccent = orangeAccent,
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
                    isLoadingComments = isLoadingComments,
                    isExpanded = isHistoryExpanded,
                    orangeAccent = orangeAccent,
                    onToggleExpanded = { isHistoryExpanded = !isHistoryExpanded }
                )
            }

            item {
                Spacer(modifier = Modifier.height(16.dp))
            }
        }
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

@Composable
private fun TaskDetailHeader(
    task: Task,
    commentsCount: Int,
    photosCount: Int
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = "Детали заявки",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SheetHeaderChip(text = "#${task.getDisplayNumber()}")
            SheetHeaderChip(text = "$commentsCount записей")
            if (photosCount > 0) {
                SheetHeaderChip(text = "$photosCount фото")
            }
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
private fun TaskSummaryCard(
    task: Task,
    formattedDate: String,
    formattedPlannedDate: String?,
    apartment: String?,
    customerName: String?,
    phoneNumber: String?,
    assignedUserName: String?,
    priorityColor: Color,
    priorityBgColor: Color,
    orangeAccent: Color,
    onStatusChange: () -> Unit,
    onPlannedDateClick: (() -> Unit)?,
    onOpenNavigation: () -> Unit,
    onDialPhone: (() -> Unit)?
) {
    TaskSectionCard(title = "Сводка") {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = priorityBgColor
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    if (task.priority == Priority.EMERGENCY || task.priority == Priority.URGENT) {
                        Icon(
                            painter = painterResource(id = R.drawable.ic_warning_triangle),
                            contentDescription = null,
                            tint = priorityColor,
                            modifier = Modifier.size(14.dp)
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
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "#${task.getDisplayNumber()}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.weight(1f))
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = task.status.toColor().copy(alpha = 0.15f),
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .clickable(onClick = onStatusChange)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = task.status.displayName,
                        style = MaterialTheme.typography.labelSmall,
                        color = task.status.toColor(),
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(
                        painter = painterResource(id = R.drawable.ic_edit),
                        contentDescription = null,
                        tint = task.status.toColor(),
                        modifier = Modifier.size(12.dp)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        Text(
            text = task.title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )

        Spacer(modifier = Modifier.height(14.dp))

        Surface(
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
            modifier = Modifier
                .fillMaxWidth()
                .clip(MaterialTheme.shapes.large)
                .clickable(onClick = onOpenNavigation)
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(
                    modifier = Modifier.size(42.dp),
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.surface
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            painter = painterResource(id = R.drawable.ic_location_pin),
                            contentDescription = null,
                            tint = Color.Unspecified,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Адрес",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        letterSpacing = 0.4.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = task.address + (apartment?.let { ", кв. $it" } ?: ""),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                Icon(
                    painter = painterResource(id = R.drawable.ic_chevron_right),
                    contentDescription = null,
                    tint = Color.Unspecified,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            SummaryMetaCard(
                modifier = Modifier.weight(1f),
                iconRes = R.drawable.ic_calendar_create,
                label = "Создана",
                value = formattedDate
            )
            SummaryMetaCard(
                modifier = Modifier.weight(1f),
                iconRes = R.drawable.ic_calendar_deadline,
                label = "Срок",
                value = formattedPlannedDate ?: "Установить",
                accentColor = orangeAccent,
                clickable = onPlannedDateClick != null,
                onClick = onPlannedDateClick
            )
        }

        if (customerName != null || phoneNumber != null || assignedUserName != null || task.isRemote || task.isPaid || task.systemType != null || task.defectType != null) {
            Spacer(modifier = Modifier.height(14.dp))
            Surface(
                shape = MaterialTheme.shapes.large,
                color = MaterialTheme.colorScheme.background
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = "Контакт и выполнение",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    customerName?.let {
                        DetailInfoRow(
                            icon = Icons.Default.Person,
                            label = "Клиент",
                            value = it
                        )
                    }
                    phoneNumber?.let {
                        DetailInfoRow(
                            icon = Icons.Default.Phone,
                            label = "Телефон",
                            value = normalizePhoneForDial(it),
                            onClick = onDialPhone
                        )
                    }
                    assignedUserName?.let {
                        DetailInfoRow(
                            icon = Icons.Default.Person,
                            label = "Исполнитель",
                            value = it
                        )
                    }
                    if (task.isRemote) {
                        DetailInfoRow(
                            icon = Icons.Default.CheckCircle,
                            label = "Формат",
                            value = "Можно выполнить удалённо"
                        )
                    }
                    if (task.isPaid) {
                        DetailInfoRow(
                            icon = Icons.Default.Info,
                            label = "Оплата",
                            value = if (task.paymentAmount > 0.0) {
                                "Платная заявка • ${"%.0f".format(task.paymentAmount)} ₽"
                            } else {
                                "Платная заявка"
                            }
                        )
                    }
                    task.systemType?.takeIf { it.isNotBlank() }?.let {
                        DetailInfoRow(
                            icon = Icons.Default.Build,
                            label = "Система",
                            value = it
                        )
                    }
                    task.defectType?.takeIf { it.isNotBlank() }?.let {
                        DetailInfoRow(
                            icon = Icons.Default.Warning,
                            label = "Неисправность",
                            value = it
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryMetaCard(
    modifier: Modifier = Modifier,
    iconRes: Int,
    label: String,
    value: String,
    accentColor: Color = MaterialTheme.colorScheme.onSurface,
    clickable: Boolean = false,
    onClick: (() -> Unit)? = null
) {
    Surface(
        modifier = modifier
            .clip(MaterialTheme.shapes.medium)
            .clickable(enabled = clickable) { onClick?.invoke() },
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.background,
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                painter = painterResource(id = iconRes),
                contentDescription = null,
                tint = Color.Unspecified,
                modifier = Modifier.size(18.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = accentColor
                )
            }
            if (clickable) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_edit),
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(14.dp)
                )
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
    orangeAccent: Color,
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
                        tint = orangeAccent,
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
                            color = orangeAccent
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
    orangeAccent: Color,
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
                        color = if (commentText.isNotEmpty()) orangeAccent else MaterialTheme.colorScheme.outline,
                        shape = RoundedCornerShape(22.dp)
                    ),
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(
                    color = MaterialTheme.colorScheme.onSurface
                ),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(orangeAccent),
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
                    containerColor = orangeAccent,
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
    isLoadingComments: Boolean,
    isExpanded: Boolean,
    orangeAccent: Color,
    onToggleExpanded: () -> Unit
) {
    TaskSectionCard(
        title = "История изменений",
        action = {
            if (isLoadingComments) {
                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
            }
        }
    ) {
        if (visibleComments.isEmpty() && hiddenComments.isEmpty() && !isLoadingComments) {
            Text(
                text = "Пока нет записей",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            visibleComments.forEachIndexed { index, comment ->
                HistoryTimelineItem(
                    comment = comment,
                    isLast = index == visibleComments.lastIndex && hiddenComments.isEmpty() && !isExpanded
                )
            }

            if (hiddenComments.isNotEmpty()) {
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
                        text = if (isExpanded) "Скрыть" else "Показать ещё ${hiddenComments.size}",
                        style = MaterialTheme.typography.labelMedium,
                        color = orangeAccent,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(
                        imageVector = if (isExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                        contentDescription = null,
                        tint = orangeAccent,
                        modifier = Modifier.size(18.dp)
                    )
                }

                AnimatedVisibility(visible = isExpanded) {
                    Column {
                        Spacer(modifier = Modifier.height(12.dp))
                        hiddenComments.forEachIndexed { index, comment ->
                            HistoryTimelineItem(
                                comment = comment,
                                isLast = index == hiddenComments.lastIndex
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
    val statusColor = when {
        comment.text.contains("Выполнен", ignoreCase = true) || 
        comment.text.contains("DONE", ignoreCase = true) -> Color(0xFF34C759)
        comment.text.contains("В работе", ignoreCase = true) || 
        comment.text.contains("В пути", ignoreCase = true) ||
        comment.text.contains("IN_PROGRESS", ignoreCase = true) -> Color(0xFF0A84FF)
        comment.text.contains("Создан", ignoreCase = true) ||
        comment.text.contains("NEW", ignoreCase = true) -> Color(0xFF9E9E9E)
        else -> MaterialTheme.colorScheme.primary
    }
    
    val formattedDate = remember(comment.createdAt) {
        com.fieldworker.ui.utils.TaskUtils.formatShortDate(comment.createdAt)
    }
    
    val formattedTime = remember(comment.createdAt) {
        try {
            val formatter = java.time.format.DateTimeFormatter.ofPattern("HH:mm")
            val dateTime = java.time.LocalDateTime.parse(
                comment.createdAt.substringBefore("+").substringBefore("Z")
                    .replace("T", " ")
                    .substringBefore(".")
                    .replace(" ", "T")
            )
            dateTime.format(formatter)
        } catch (e: Exception) {
            ""
        }
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

@Composable
fun CommentCard(comment: Comment) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (comment.isStatusChange) 
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
            else 
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            Icon(
                imageVector = if (comment.isStatusChange) Icons.Default.Edit else Icons.Default.MailOutline,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = if (comment.isStatusChange) 
                    MaterialTheme.colorScheme.primary 
                else 
                    MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.width(8.dp))
            Column {
                Text(
                    text = comment.text,
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${comment.author} • ${comment.createdAt.take(16).replace("T", " ")}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun EmptyState(
    message: String,
    isFiltered: Boolean = false
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
                modifier = Modifier.size(80.dp),
                tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.3f)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (isFiltered) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Попробуйте изменить параметры поиска",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
            }
        }
    }
}

/**
 * Skeleton loading для карточки задачи
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
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f),
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
        ),
        start = Offset(shimmerTranslate - 200f, 0f),
        end = Offset(shimmerTranslate, 0f)
    )
    
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Круглый индикатор
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(shimmerBrush)
            )
            
            Spacer(modifier = Modifier.width(12.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                // Заголовок
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.7f)
                        .height(16.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(shimmerBrush)
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                // Адрес
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.9f)
                        .height(12.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(shimmerBrush)
                )
                
                Spacer(modifier = Modifier.height(4.dp))
                
                // Статус
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.4f)
                        .height(12.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(shimmerBrush)
                )
            }
            
            // Стрелка
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(shimmerBrush)
            )
        }
    }
}

/**
 * Список skeleton-элементов для загрузки
 */
@Composable
fun TaskListSkeleton(count: Int = 5) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = 8.dp,
            bottom = 80.dp
        ),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(count) {
            TaskListItemSkeleton()
        }
    }
}
