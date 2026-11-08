package com.fieldworker.ui.day

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.data.api.DayRouteRequest
import com.fieldworker.data.api.TasksApi
import com.fieldworker.data.network.NetworkMonitor
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.usecase.GetTasksUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.LocalDate
import javax.inject.Inject

/**
 * «Мой день»: заявки — из локального кеша (работает без связи), порядок
 * объезда — на устройстве и на сервере. Перестановка без связи помечается
 * «не отправлено» и уходит на сервер при следующем обновлении или как только
 * вернулась сеть.
 */
@HiltViewModel
class MyDayViewModel @Inject constructor(
    private val api: TasksApi,
    private val preferences: AppPreferences,
    private val tasksUseCase: GetTasksUseCase,
    networkMonitor: NetworkMonitor,
) : ViewModel() {
    private val currentDay = MutableStateFlow(LocalDate.now().toString())
    val day = currentDay.asStateFlow()
    private val order = MutableStateFlow(preferences.getDayRoute(currentDay.value))
    private val routeMutex = Mutex()
    private val _message = MutableStateFlow<String?>(null)
    val message = _message.asStateFlow()
    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing = _isRefreshing.asStateFlow()
    private var refreshJob: Job? = null

    /** null — кеш ещё не прочитан (это не «на сегодня пусто»). */
    val tasks: StateFlow<List<Task>?> = combine(tasksUseCase.tasksFlow, order, currentDay) { tasks, order, day ->
        dayRouteTasks(tasks, order, day, preferences.getUserId())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    init {
        // Сеть вернулась — отправляем порядок, переставленный без неё
        viewModelScope.launch {
            networkMonitor.isOnline.drop(1).filter { it }.collect {
                val day = currentDay.value
                if (preferences.isDayRoutePending(day)) syncRoute(day)
            }
        }
    }

    /** Обновить заявки и порядок дня. Повторный вызов во время обновления — no-op. */
    fun refresh() {
        rollOverDay()
        if (refreshJob?.isActive == true) return
        refreshJob = viewModelScope.launch {
            _isRefreshing.value = true
            try {
                tasksUseCase.refreshTasks()
                syncRoute(currentDay.value)
            } finally {
                _isRefreshing.value = false
            }
        }
    }

    fun move(taskId: Long, shift: Int) {
        val day = currentDay.value
        val ids = tasks.value?.map { it.id }?.toMutableList() ?: return
        val index = ids.indexOf(taskId)
        val target = index + shift
        if (index < 0 || target !in ids.indices) return
        ids[index] = ids[target].also { ids[target] = ids[index] }
        order.value = ids
        preferences.saveDayRoute(day, ids, pending = true)
        _message.value = "Порядок сохранён на телефоне"
        // Только порядок: перечитывать все заявки на каждое нажатие незачем
        viewModelScope.launch { syncRoute(day) }
    }

    /** Наступил новый день, пока экран был открыт, — берём его порядок. */
    private fun rollOverDay() {
        val today = LocalDate.now().toString()
        if (currentDay.value != today) {
            currentDay.value = today
            order.value = preferences.getDayRoute(today)
        }
    }

    private suspend fun syncRoute(day: String): Unit = routeMutex.withLock {
        if (currentDay.value != day) return@withLock
        try {
            val response = api.getMyDay(day)
            if (!response.isSuccessful) {
                _message.value = unsyncedMessage(day, "Сервер не ответил (${response.code()}).")
                return@withLock
            }
            val serverIds = response.body()?.tasks?.map { it.id }.orEmpty()
            val local = order.value
            val pending = preferences.isDayRoutePending(day)
            val ids = if (pending) mergeDayOrder(local, serverIds) else serverIds
            if (pending) {
                val result = api.saveDayRoute(day, DayRouteRequest(ids))
                if (!result.isSuccessful) {
                    _message.value = unsyncedMessage(day, "Сервер не принял порядок (${result.code()}).")
                    return@withLock
                }
            }
            // Пока ждали сервер, порядок переставили ещё раз — его отправит
            // следующий запрос, а этот ответ уже устарел и не должен его затереть.
            if (currentDay.value != day || order.value != local) return@withLock
            order.value = ids
            preferences.saveDayRoute(day, ids, pending = false)
            _message.value = null
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            _message.value = unsyncedMessage(day, "Нет связи.")
        }
    }

    private fun unsyncedMessage(day: String, reason: String): String =
        if (preferences.isDayRoutePending(day)) {
            "$reason Порядок выездов сохранён на телефоне и уйдёт на сервер, когда появится связь."
        } else {
            "$reason Показаны сохранённые заявки."
        }
}
