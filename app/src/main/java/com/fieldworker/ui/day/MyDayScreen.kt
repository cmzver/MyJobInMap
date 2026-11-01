package com.fieldworker.ui.day

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fieldworker.data.api.TasksApi
import com.fieldworker.data.api.DayRouteRequest
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.domain.usecase.GetTasksUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.LocalDate
import javax.inject.Inject

@HiltViewModel
class MyDayViewModel @Inject constructor(
    private val api: TasksApi,
    private val preferences: AppPreferences,
    private val tasksUseCase: GetTasksUseCase,
) : ViewModel() {
    private val currentDay = MutableStateFlow(LocalDate.now().toString())
    val day = currentDay.asStateFlow()
    private val order = MutableStateFlow(preferences.getDayRoute(currentDay.value))
    private val saveMutex = Mutex()
    private val _message = MutableStateFlow<String?>(null)
    val message = _message.asStateFlow()
    val tasks = combine(tasksUseCase.tasksFlow, order, currentDay) { tasks, order, day ->
        val ranks = order.withIndex().associate { it.value to it.index }
        tasks.filter { task ->
            task.assignedUserId == preferences.getUserId() &&
                task.status in listOf(TaskStatus.NEW, TaskStatus.IN_PROGRESS) &&
                (task.plannedDate == null || task.plannedDate.take(10) <= day)
        }.sortedWith(compareBy<Task> { ranks[it.id] ?: Int.MAX_VALUE }
            .thenBy { it.plannedDate ?: "9999" }.thenBy { it.id })
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun refresh() {
        val day = LocalDate.now().toString()
        if (currentDay.value != day) { currentDay.value = day; order.value = preferences.getDayRoute(day) }
        viewModelScope.launch {
            try {
                tasksUseCase.refreshTasks()
                saveMutex.withLock {
                    if (currentDay.value != day) return@withLock
                    val response = api.getMyDay(day)
                    if (!response.isSuccessful) {
                        _message.value = "Показаны сохранённые заявки. Сервер: ${response.code()}"
                        return@withLock
                    }
                    val serverIds = response.body()?.tasks?.map { it.id }.orEmpty()
                    val pending = preferences.isDayRoutePending(day)
                    val ids = if (pending) order.value.filter { it in serverIds } + serverIds.filterNot { it in order.value } else serverIds
                    if (pending) {
                        val result = api.saveDayRoute(day, DayRouteRequest(ids))
                        if (!result.isSuccessful) {
                            _message.value = "Порядок сохранён на устройстве. Сервер: ${result.code()}"
                            return@withLock
                        }
                    }
                    if (currentDay.value != day) return@withLock
                    order.value = ids
                    preferences.saveDayRoute(day, ids, pending = false)
                    _message.value = null
                }
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { _message.value = "Нет связи. Показаны сохранённые заявки и порядок выездов." }
        }
    }

    fun move(taskId: Long, shift: Int) {
        val day = currentDay.value
        val ids = tasks.value.map { it.id }.toMutableList()
        val index = ids.indexOf(taskId)
        val target = index + shift
        if (index < 0 || target !in ids.indices) return
        val previous = ids[index]
        ids[index] = ids[target]
        ids[target] = previous
        order.value = ids
        preferences.saveDayRoute(day, ids, pending = true)
        _message.value = "Порядок сохранён на устройстве"
        refresh()
    }
}

@Composable
fun MyDayScreen(
    onOpenTask: (Task) -> Unit,
    onStartTask: (Task) -> Unit,
    viewModel: MyDayViewModel = hiltViewModel(),
) {
    val day by viewModel.day.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) viewModel.refresh() }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    val tasks by viewModel.tasks.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val context = LocalContext.current
    fun open(uri: String) {
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri))) }
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column { Text("Мой день", style = MaterialTheme.typography.titleLarge); Text(day) }
            TextButton(onClick = viewModel::refresh) { Text("Обновить") }
        }
        message?.let { Text(it, Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodySmall) }
        if (tasks.isEmpty()) Text("Открытых заявок на сегодня нет", Modifier.padding(16.dp))
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            itemsIndexed(tasks, key = { _, task -> task.id }) { index, task ->
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        TextButton(onClick = { onOpenTask(task) }) { Text("${index + 1}. ${task.getDisplayNumber()} · ${task.title}") }
                        Text(task.address)
                        Text(task.status.displayName, style = MaterialTheme.typography.labelMedium)
                        task.plannedDate?.let { Text("План: ${it.take(16).replace('T', ' ')}", style = MaterialTheme.typography.bodySmall) }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = { viewModel.move(task.id, -1) }, enabled = index > 0) { Text("Выше") }
                            TextButton(onClick = { viewModel.move(task.id, 1) }, enabled = index < tasks.lastIndex) { Text("Ниже") }
                            TextButton(onClick = { open("geo:0,0?q=${Uri.encode(task.address)}") }) { Text("Маршрут") }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            task.customerPhone?.let { phone -> TextButton(onClick = { open("tel:${phone.filter { it.isDigit() || it == '+' }}") }) { Text("Позвонить") } }
                            if (task.status == TaskStatus.NEW) Button(onClick = { onStartTask(task) }) { Text("Начать") }
                        }
                    }
                }
            }
        }
    }
}
