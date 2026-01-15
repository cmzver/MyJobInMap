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
import com.fieldworker.R
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
    showStatusDialog: Boolean,
    onRefresh: () -> Unit,
    onTaskClick: (Task) -> Unit,
    onTaskDismiss: () -> Unit,
    onStatusChange: () -> Unit,
    onHideStatusDialog: () -> Unit,
    onStatusSelected: (Long, TaskStatus, String) -> Unit,
    onAddComment: (Long, String) -> Unit,
    statusFilter: Set<TaskStatus>,
    priorityFilter: Set<Priority>,
    searchQuery: String,
    onStatusFilterChange: (Set<TaskStatus>) -> Unit,
    onPriorityFilterChange: (Set<Priority>) -> Unit,
    onSearchQueryChange: (String) -> Unit,
    // Новые параметры
    sortOrder: com.fieldworker.ui.utils.TaskSortOrder = com.fieldworker.ui.utils.TaskSortOrder.BY_DATE_DESC,
    onSortOrderChange: (com.fieldworker.ui.utils.TaskSortOrder) -> Unit = {},
    userLat: Double? = null,
    userLon: Double? = null,
    // Параметры для фотографий
    photos: List<TaskPhoto> = emptyList(),
    isLoadingPhotos: Boolean = false,
    isUploadingPhoto: Boolean = false,
    baseUrl: String = "",
    authToken: String? = null,
    onAddPhotoClick: () -> Unit = {},
    onDeletePhoto: (Long) -> Unit = {},
    // Параметры для планируемой даты
    onPlannedDateChange: ((Long, String?) -> Unit)? = null
) {
    var showFilters by remember { mutableStateOf(false) }
    var showSortMenu by remember { mutableStateOf(false) }
    
    Column(modifier = Modifier.fillMaxSize()) {
        // Поиск
        SearchBar(
            query = searchQuery,
            onQueryChange = onSearchQueryChange,
            onToggleFilters = { showFilters = !showFilters },
            hasActiveFilters = statusFilter.isNotEmpty() || priorityFilter.isNotEmpty()
        )
        
        // Панель фильтров
        AnimatedVisibility(
            visible = showFilters,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            FiltersPanel(
                statusFilter = statusFilter,
                priorityFilter = priorityFilter,
                onStatusFilterChange = onStatusFilterChange,
                onPriorityFilterChange = onPriorityFilterChange,
                onClearFilters = {
                    onStatusFilterChange(emptySet())
                    onPriorityFilterChange(emptySet())
                }
            )
        }
        
        // Счётчик результатов + сортировка
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Найдено: ${tasks.size}",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (isLoading && tasks.isNotEmpty()) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    Spacer(modifier = Modifier.width(8.dp))
                }
                
                // Кнопка сортировки в стиле референса
                Box {
                    Surface(
                        onClick = { showSortMenu = true },
                        shape = RoundedCornerShape(8.dp),
                        color = Color.Transparent
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.List,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = sortOrder.displayName,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                    
                    DropdownMenu(
                        expanded = showSortMenu,
                        onDismissRequest = { showSortMenu = false }
                    ) {
                        com.fieldworker.ui.utils.TaskSortOrder.entries.forEach { order ->
                            DropdownMenuItem(
                                text = { Text(order.displayName) },
                                onClick = {
                                    onSortOrderChange(order)
                                    showSortMenu = false
                                },
                                leadingIcon = {
                                    if (order == sortOrder) {
                                        Icon(
                                            Icons.Default.Check,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary
                                        )
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
        
        // Список задач с FAB и Pull-to-Refresh
        Box(modifier = Modifier.weight(1f)) {
            val hasFilters = searchQuery.isNotEmpty() || statusFilter.isNotEmpty() || priorityFilter.isNotEmpty()
            
            when {
                // Показываем skeleton при первой загрузке (список пуст и идёт загрузка)
                tasks.isEmpty() && isLoading -> {
                    TaskListSkeleton()
                }
                // Пустое состояние
                tasks.isEmpty() && !isLoading -> {
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
                        onRefresh = onRefresh,
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
            comments = comments,
            isLoadingComments = isLoadingComments,
            photos = photos,
            isLoadingPhotos = isLoadingPhotos,
            isUploadingPhoto = isUploadingPhoto,
            baseUrl = baseUrl,
            authToken = authToken,
            onDismiss = onTaskDismiss,
            onStatusChange = onStatusChange,
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
    hasActiveFilters: Boolean,
    notificationCount: Int = 0
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
        
        Spacer(modifier = Modifier.width(8.dp))
        
        // Колокольчик с бейджем
        BadgedBox(
            badge = {
                if (notificationCount > 0) {
                    Badge(
                        containerColor = MaterialTheme.colorScheme.primary
                    ) {
                        Text(
                            text = if (notificationCount > 99) "99+" else notificationCount.toString(),
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
            }
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 2.dp
            ) {
                IconButton(onClick = { /* Уведомления */ }) {
                    Icon(
                        Icons.Default.Notifications,
                        contentDescription = "Уведомления",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
fun FiltersPanel(
    statusFilter: Set<TaskStatus>,
    priorityFilter: Set<Priority>,
    onStatusFilterChange: (Set<TaskStatus>) -> Unit,
    onPriorityFilterChange: (Set<Priority>) -> Unit,
    onClearFilters: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            // Заголовок с кнопкой сброса
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Фильтры",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold
                )
                TextButton(onClick = onClearFilters) {
                    Text("Сбросить")
                }
            }
            
            // Фильтр по статусу
            Text(
                text = "Статус",
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
            )
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(TaskStatus.entries.filter { it != TaskStatus.UNKNOWN }) { status ->
                    FilterChip(
                        selected = status in statusFilter,
                        onClick = {
                            val newFilter = if (status in statusFilter) {
                                statusFilter - status
                            } else {
                                statusFilter + status
                            }
                            onStatusFilterChange(newFilter)
                        },
                        label = { Text(status.displayName) },
                        leadingIcon = {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(status.toColor())
                            )
                        }
                    )
                }
            }
            
            // Фильтр по приоритету
            Text(
                text = "Приоритет",
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(top = 12.dp, bottom = 4.dp)
            )
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(Priority.entries.toList()) { priority ->
                    FilterChip(
                        selected = priority in priorityFilter,
                        onClick = {
                            val newFilter = if (priority in priorityFilter) {
                                priorityFilter - priority
                            } else {
                                priorityFilter + priority
                            }
                            onPriorityFilterChange(newFilter)
                        },
                        label = { Text(priority.displayName) },
                        leadingIcon = {
                            PriorityBadge(priority = priority)
                        }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailBottomSheet(
    task: Task,
    comments: List<Comment>,
    isLoadingComments: Boolean,
    photos: List<TaskPhoto> = emptyList(),
    isLoadingPhotos: Boolean = false,
    isUploadingPhoto: Boolean = false,
    baseUrl: String = "",
    authToken: String? = null,
    onDismiss: () -> Unit,
    onStatusChange: () -> Unit,
    onAddComment: (String) -> Unit,
    onAddPhotoClick: () -> Unit = {},
    onDeletePhoto: (Long) -> Unit = {},
    onPlannedDateChange: ((String?) -> Unit)? = null
) {
    var commentText by remember { mutableStateOf("") }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val context = LocalContext.current
    
    // Состояния для спойлеров
    var isDescriptionExpanded by remember { mutableStateOf(true) }
    var isPhotosExpanded by remember { mutableStateOf(false) }
    var isHistoryExpanded by remember { mutableStateOf(false) }
    
    // Состояние для выбора даты
    var showDatePicker by remember { mutableStateOf(false) }
    
    // Извлекаем данные из задачи
    val phoneNumber = remember(task) {
        extractPhoneNumber(task.title) ?: extractPhoneNumber(task.description)
    }
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
            // ========== ЗАГОЛОВОК (Детали заказа) ==========
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Детали заказа",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
            }
            
            // ========== 1. ГЛАВНАЯ КАРТОЧКА ==========
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    shape = MaterialTheme.shapes.large,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        // Приоритет + номер + статус
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            // Метка приоритета с иконкой
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = priorityBgColor
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
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
                            // Статус (кликабельный)
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = task.status.toColor().copy(alpha = 0.15f),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
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
                        
                        Spacer(modifier = Modifier.height(12.dp))
                        
                        // Название заявки
                        Text(
                            text = task.title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        // ===== АДРЕС ДОСТАВКИ =====
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)), // Светло-жёлтый фон
                            shape = MaterialTheme.shapes.medium,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        if (task.hasValidCoordinates()) {
                                            com.fieldworker.ui.utils.TaskUtils.openNavigation(context, task)
                                        } else {
                                            Toast.makeText(context, "Координаты не указаны", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    painter = painterResource(id = R.drawable.ic_location_pin),
                                    contentDescription = null,
                                    tint = Color.Unspecified, // Используем цвета из XML
                                    modifier = Modifier.size(28.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "АДРЕС ДОСТАВКИ",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        letterSpacing = 1.sp
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
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(12.dp))
                        
                        // ===== ДАТЫ =====
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            // Дата создания
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    painter = painterResource(id = R.drawable.ic_calendar_create),
                                    contentDescription = null,
                                    tint = Color.Unspecified,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Column {
                                    Text(
                                        text = "Дата создания",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Text(
                                        text = formattedDate,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                            
                            // Срок выполнения (кликабельный и интуитивный)
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (onPlannedDateChange != null) Color(0xFFFFF3E0) else Color.Transparent,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable(enabled = onPlannedDateChange != null) { 
                                        showDatePicker = true 
                                    }
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)
                                ) {
                                    Icon(
                                        painter = painterResource(id = R.drawable.ic_calendar_deadline),
                                        contentDescription = null,
                                        tint = Color.Unspecified,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Column {
                                        Text(
                                            text = "Срок выполнения",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = orangeAccent
                                        )
                                        Text(
                                            text = formattedPlannedDate ?: "Установить",
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = orangeAccent
                                        )
                                    }
                                    if (onPlannedDateChange != null) {
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Icon(
                                            painter = painterResource(id = R.drawable.ic_edit),
                                            contentDescription = "Изменить",
                                            tint = orangeAccent,
                                            modifier = Modifier.size(14.dp)
                                        )
                                    }
                                }
                            }
                        }
                        
                        // ===== ТЕЛЕФОН =====
                        if (phoneNumber != null) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                                shape = MaterialTheme.shapes.medium,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            val normalizedPhone = if (phoneNumber.startsWith("8")) {
                                                "+7${phoneNumber.substring(1)}"
                                            } else if (!phoneNumber.startsWith("+")) {
                                                "+$phoneNumber"
                                            } else {
                                                phoneNumber
                                            }
                                            val intent = Intent(Intent.ACTION_DIAL).apply {
                                                data = Uri.parse("tel:$normalizedPhone")
                                            }
                                            context.startActivity(intent)
                                        }
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        painter = painterResource(id = R.drawable.ic_phone_call),
                                        contentDescription = null,
                                        tint = Color.Unspecified,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Text(
                                        text = if (phoneNumber.startsWith("+")) phoneNumber else "+$phoneNumber",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                            }
                        }
                    }
                }
            }
            
            // ========== 2. ОПИСАНИЕ РАБОТ ==========
            if (additionalInfo != null || task.description.isNotBlank()) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                        shape = MaterialTheme.shapes.medium,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp)
                        ) {
                            Text(
                                text = "Описание работ",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = additionalInfo ?: task.description,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
            
            // ========== 3. КНОПКИ ДЕЙСТВИЙ (УДАЛЕНО) ==========
            // Кнопки перенесены: Маршрут -> клик по адресу, Статус -> клик по статусу
            
            // ========== 4. ФОТОГРАФИИ ==========
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    shape = MaterialTheme.shapes.medium,
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
                                .clickable { isPhotosExpanded = !isPhotosExpanded }
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
                                    Surface(
                                        shape = MaterialTheme.shapes.medium,
                                        color = orangeAccent.copy(alpha = 0.15f)
                                    ) {
                                        Text(
                                            text = photos.size.toString(),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = orangeAccent,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
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
                                    imageVector = if (isPhotosExpanded) 
                                        Icons.Default.KeyboardArrowUp 
                                    else 
                                        Icons.Default.KeyboardArrowDown,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        
                        AnimatedVisibility(visible = isPhotosExpanded) {
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
            
            // ========== 5. ДОБАВИТЬ КОММЕНТАРИЙ ==========
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        androidx.compose.foundation.text.BasicTextField(
                            value = commentText,
                            onValueChange = { commentText = it },
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp)
                                .background(Color.Transparent, RoundedCornerShape(20.dp))
                                .border(
                                    width = 1.dp, 
                                    color = if (commentText.isNotEmpty()) orangeAccent else MaterialTheme.colorScheme.outline, 
                                    shape = RoundedCornerShape(20.dp)
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
                                            "Комментарий...",
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
                            onClick = {
                                if (commentText.isNotBlank()) {
                                    onAddComment(commentText)
                                    commentText = ""
                                }
                            },
                            enabled = commentText.isNotBlank(),
                            modifier = Modifier.size(40.dp),
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
            
            // ========== 6. ИСТОРИЯ ИЗМЕНЕНИЙ ==========
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .animateContentSize()
                            .padding(16.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "История изменений",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            if (isLoadingComments) {
                                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        if (sortedComments.isEmpty() && !isLoadingComments) {
                            Text(
                                text = "Пока нет записей",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            // Видимые комментарии (последние 3)
                            visibleComments.forEachIndexed { index, comment ->
                                HistoryTimelineItem(
                                    comment = comment,
                                    isLast = index == visibleComments.lastIndex && hiddenComments.isEmpty() && !isHistoryExpanded
                                )
                            }
                            
                            // Спойлер для остальных
                            if (hiddenComments.isNotEmpty()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .clickable { isHistoryExpanded = !isHistoryExpanded }
                                        .background(MaterialTheme.colorScheme.background)
                                        .padding(12.dp),
                                    horizontalArrangement = Arrangement.Center,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = if (isHistoryExpanded) "Скрыть" else "Показать ещё ${hiddenComments.size}",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = orangeAccent,
                                        fontWeight = FontWeight.Medium
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Icon(
                                        imageVector = if (isHistoryExpanded) 
                                            Icons.Default.KeyboardArrowUp 
                                        else 
                                            Icons.Default.KeyboardArrowDown,
                                        contentDescription = null,
                                        tint = orangeAccent,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                
                                AnimatedVisibility(visible = isHistoryExpanded) {
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
            }
            
            // Отступ снизу
            item {
                Spacer(modifier = Modifier.height(16.dp))
            }
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
