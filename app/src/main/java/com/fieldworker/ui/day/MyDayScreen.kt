package com.fieldworker.ui.day

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.components.BulletDot
import com.fieldworker.ui.components.EmptyState
import com.fieldworker.ui.components.StatusChip
import com.fieldworker.ui.components.taskHeadline
import com.fieldworker.ui.list.TaskListSkeleton
import com.fieldworker.ui.theme.AppShape
import com.fieldworker.ui.utils.TaskUtils
import com.fieldworker.ui.utils.accentTextColor
import com.fieldworker.ui.utils.contentColor
import com.fieldworker.ui.utils.dialPhone
import com.fieldworker.ui.utils.formatPhoneForDisplay

@Composable
fun MyDayScreen(
    onOpenTask: (Task) -> Unit,
    onStartTask: (Task) -> Unit,
    viewModel: MyDayViewModel = hiltViewModel(),
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) viewModel.refresh() }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    val day by viewModel.day.collectAsStateWithLifecycle()
    val tasks by viewModel.tasks.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val isRefreshing by viewModel.isRefreshing.collectAsStateWithLifecycle()
    val context = LocalContext.current

    MyDayContent(
        day = day,
        tasks = tasks,
        message = message,
        isRefreshing = isRefreshing,
        onRefresh = viewModel::refresh,
        onMove = viewModel::move,
        onOpenTask = onOpenTask,
        onStartTask = onStartTask,
        onGo = { TaskUtils.openRoute(context, tasks.orEmpty()) },
        onRoute = { task -> TaskUtils.openNavigation(context, task) },
        onCall = { phone -> dialPhone(context, phone) },
    )
}

/**
 * Экран дня без ViewModel (превью/скриншоты). [tasks] == null — кеш ещё
 * читается. Номер точки — порядковый, как у точки «Маршрута дня» на карте.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyDayContent(
    day: String,
    tasks: List<Task>?,
    message: String?,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    onMove: (taskId: Long, shift: Int) -> Unit,
    onOpenTask: (Task) -> Unit,
    onStartTask: (Task) -> Unit,
    onGo: () -> Unit,
    onRoute: (Task) -> Unit,
    onCall: (String) -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        MyDayHeader(
            subtitle = myDaySubtitle(day, tasks?.size),
            canGo = tasks.orEmpty().any { it.hasValidCoordinates() },
            onGo = onGo,
        )
        message?.let { MyDayNotice(it) }
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = onRefresh,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            when {
                tasks == null -> TaskListSkeleton(count = 3)
                tasks.isEmpty() -> MyDayEmpty()
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    itemsIndexed(tasks, key = { _, task -> task.id }) { index, task ->
                        DayStopCard(
                            task = task,
                            number = index + 1,
                            day = day,
                            canMoveUp = index > 0,
                            canMoveDown = index < tasks.lastIndex,
                            onMove = { shift -> onMove(task.id, shift) },
                            onOpen = { onOpenTask(task) },
                            onStart = { onStartTask(task) },
                            onRoute = { onRoute(task) },
                            onCall = onCall,
                            modifier = Modifier.animateItem(),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MyDayHeader(subtitle: String, canGo: Boolean, onGo: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 12.dp, top = 12.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Мой день",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        // Весь маршрут в навигатор — как «Поехали» у «Маршрута дня» на карте
        if (canGo) {
            Button(onClick = onGo) { Text("Поехали") }
        }
    }
}

/** Плашка состояния: работа без связи, порядок не отправлен и т.п. */
@Composable
private fun MyDayNotice(text: String) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp),
        shape = AppShape.md,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun MyDayEmpty() {
    // Прокручиваемый — чтобы и пустой экран обновлялся жестом вниз
    EmptyState(
        title = "На сегодня выездов нет",
        message = "Здесь будут ваши открытые заявки на сегодня и просроченные",
        scrollable = true,
    )
}

/**
 * Точка дня — плоская карточка с обводкой, как в ленте: номер в цвете точки
 * на карте, статус, суть, адрес, план; справа — перестановка; снизу — действия.
 */
@Composable
private fun DayStopCard(
    task: Task,
    number: Int,
    day: String,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onMove: (Int) -> Unit,
    onOpen: () -> Unit,
    onStart: () -> Unit,
    onRoute: () -> Unit,
    onCall: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val displayNumber = remember(task) { task.getDisplayNumber() }
    val headline = remember(task) { taskHeadline(task, displayNumber) }
    val plan = remember(task.plannedDate, day) { dayStopPlan(task.plannedDate, day) }
    val phone = task.customerPhone?.takeIf { it.isNotBlank() }
    val showPriority = task.priority == Priority.EMERGENCY || task.priority == Priority.URGENT

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = AppShape.md,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onOpen)
                    .padding(start = 12.dp, top = 10.dp, bottom = 8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                StopNumber(number = number, color = dayStopColor(task))
                Spacer(modifier = Modifier.width(10.dp))
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        StatusChip(task = task)
                        Text(
                            text = "#$displayNumber",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        if (showPriority) {
                            BulletDot()
                            val color = task.priority.contentColor()
                            if (task.priority == Priority.EMERGENCY) {
                                Icon(
                                    imageVector = Icons.Default.Warning,
                                    contentDescription = null,
                                    tint = color,
                                    modifier = Modifier.size(14.dp),
                                )
                            }
                            Text(
                                text = task.priority.displayName,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = color,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    Text(
                        text = headline,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = task.address,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    plan?.let {
                        Text(
                            text = it.text,
                            style = MaterialTheme.typography.bodySmall,
                            color = if (it.overdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = if (it.overdue) FontWeight.SemiBold else FontWeight.Normal,
                        )
                    }
                }
                Column {
                    IconButton(onClick = { onMove(-1) }, enabled = canMoveUp) {
                        Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Поднять выше")
                    }
                    IconButton(onClick = { onMove(1) }, enabled = canMoveDown) {
                        Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Опустить ниже")
                    }
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 4.dp, end = 12.dp, top = 2.dp, bottom = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StopAction(icon = Icons.Default.LocationOn, label = "Маршрут", onClick = onRoute)
                phone?.let { StopAction(icon = Icons.Default.Phone, label = formatPhoneForDisplay(it), onClick = { onCall(it) }) }
                Spacer(modifier = Modifier.weight(1f))
                if (task.status == TaskStatus.NEW) {
                    Button(
                        onClick = onStart,
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp),
                        modifier = Modifier.height(34.dp),
                    ) {
                        Text("Взять в работу", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

/** Номер точки — скруглённый квадрат, как значок точки маршрута на карте. */
@Composable
private fun StopNumber(number: Int, color: Color) {
    Box(
        modifier = Modifier
            .size(28.dp)
            .background(color, AppShape.sm),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = number.toString(),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = Color.White,
        )
    }
}

/** Действие-ссылка карточки: иконка + подпись акцентным цветом. */
@Composable
private fun StopAction(icon: ImageVector, label: String, onClick: () -> Unit) {
    TextButton(
        onClick = onClick,
        colors = ButtonDefaults.textButtonColors(contentColor = accentTextColor()),
        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(4.dp))
        Text(label, style = MaterialTheme.typography.labelLarge, maxLines = 1)
    }
}

