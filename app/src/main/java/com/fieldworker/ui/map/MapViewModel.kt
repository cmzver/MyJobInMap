package com.fieldworker.ui.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.paging.PagingData
import androidx.paging.cachedIn
import com.fieldworker.data.network.NetworkMonitor
import com.fieldworker.data.network.ServerHealthCheck
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.AddressRepository
import com.fieldworker.data.repository.UsersRepository
import com.fieldworker.data.sync.SyncManager
import android.net.Uri
import com.fieldworker.domain.model.AccessLevel
import com.fieldworker.domain.model.AddressDetails
import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.FailedAction
import com.fieldworker.domain.model.PendingPhoto
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskPhoto
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.domain.model.User
import com.fieldworker.domain.usecase.GetTasksUseCase
import com.fieldworker.domain.usecase.TaskCommentsUseCase
import com.fieldworker.domain.usecase.TaskPhotosUseCase
import com.fieldworker.domain.usecase.UpdateTaskStatusUseCase
import com.fieldworker.ui.settings.ConnectionStatus
import com.fieldworker.ui.utils.TaskSortOrder
import com.fieldworker.ui.utils.sortedBy
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject

/**
 * Какие заявки показывать диспетчеру/админу. Работнику сервер и так отдаёт
 * только его заявки, поэтому для него фильтр не применяется.
 */
enum class TaskScope(val displayName: String) {
    ALL("Все"),
    MINE("Мои"),
    UNASSIGNED("Без исполнителя"),
}

/** Разделы карточки заявки, которые подгружаются с сервера отдельно от неё. */
enum class TaskDetailSection { OBJECT, PHOTOS, HISTORY }

/**
 * UI State для экрана карты и списка
 */
data class MapUiState(
    val tasks: List<Task> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedTask: Task? = null,
    val addressDetails: AddressDetails? = null,
    val isLoadingAddress: Boolean = false,
    val hasAttemptedAddressLookup: Boolean = false,
    val comments: List<Comment> = emptyList(),
    val isLoadingComments: Boolean = false,
    val showStatusDialog: Boolean = false,
    // Переход уже выбран кнопкой следующего шага — диалог только подтверждает
    val statusDialogTarget: TaskStatus? = null,
    val statusUpdateSuccess: Boolean = false,
    // Фотографии
    val photos: List<TaskPhoto> = emptyList(),
    val isLoadingPhotos: Boolean = false,
    val isUploadingPhoto: Boolean = false,
    // Снимки выбранной заявки, ещё не дошедшие до сервера
    val pendingPhotos: List<PendingPhoto> = emptyList(),
    // Разделы карточки, не загруженные без связи (≠ «пусто» и ≠ «не найдено»)
    val unavailableDetails: Set<TaskDetailSection> = emptySet(),
    // Фильтры для списка
    val statusFilter: Set<TaskStatus> = emptySet(),
    val priorityFilter: Set<Priority> = emptySet(),
    val searchQuery: String = "",
    // Сортировка
    val sortOrder: TaskSortOrder = TaskSortOrder.BY_DATE_DESC,
    // Местоположение
    val showMyLocation: Boolean = true,
    val myLocationLat: Double? = null,
    val myLocationLon: Double? = null,
    // Скрывать завершённые (DONE + CANCELLED)
    val hideTerminalTasks: Boolean = true,
    // Offline режим
    val isOffline: Boolean = false,
    val pendingActionsCount: Int = 0,
    val failedActions: List<FailedAction> = emptyList(),
    val showFailedActions: Boolean = false,
    val lastSyncTime: Long? = null,
    // Доступ текущего пользователя
    val access: AccessLevel = AccessLevel.WORKER,
    val currentUserId: Long = 0,
    val canAssignTasks: Boolean = false,
    val taskScope: TaskScope = TaskScope.ALL,
    // Назначение исполнителя
    val showAssignDialog: Boolean = false,
    val workers: List<User> = emptyList(),
    val isLoadingWorkers: Boolean = false,
    val isAssigning: Boolean = false
) {
    val canManageTasks: Boolean
        get() = access.canManageTasks

    val newTasksCount: Int
        get() = tasks.count { it.status == TaskStatus.NEW }

    /** Очередь подписана на выбранную заявку, но при смене карточки чужие снимки не показываем. */
    val selectedTaskPendingPhotos: List<PendingPhoto>
        get() = pendingPhotos.filter { it.taskId == selectedTask?.id }

    /** Только то, от чего зависит отфильтрованный список (см. [MapViewModel.filteredTasks]). */
    internal fun filterInput() = TaskFilterInput(
        tasks = tasks,
        statusFilter = statusFilter,
        priorityFilter = priorityFilter,
        searchQuery = searchQuery,
        sortOrder = sortOrder,
        // Координаты нужны только сортировке по расстоянию — иначе каждый GPS-фикс
        // пересчитывал бы ленту впустую
        myLocationLat = myLocationLat.takeIf { sortOrder == TaskSortOrder.BY_DISTANCE },
        myLocationLon = myLocationLon.takeIf { sortOrder == TaskSortOrder.BY_DISTANCE },
        hideTerminalTasks = hideTerminalTasks,
        canManageTasks = canManageTasks,
        taskScope = taskScope,
        currentUserId = currentUserId,
    )

    internal fun applyFilters(): List<Task> = filterInput().apply()
}

/**
 * Входы фильтрации ленты. Отдельный класс, чтобы пересчитывать список только
 * при их изменении, а не на каждый isLoading/isOffline/фото в [MapUiState].
 */
internal data class TaskFilterInput(
    val tasks: List<Task>,
    val statusFilter: Set<TaskStatus>,
    val priorityFilter: Set<Priority>,
    val searchQuery: String,
    val sortOrder: TaskSortOrder,
    val myLocationLat: Double?,
    val myLocationLon: Double?,
    val hideTerminalTasks: Boolean,
    val canManageTasks: Boolean,
    val taskScope: TaskScope,
    val currentUserId: Long,
) {
    fun apply(): List<Task> {
        var result = tasks
        if (canManageTasks) {
            result = when (taskScope) {
                TaskScope.ALL -> result
                TaskScope.MINE -> result.filter { it.assignedUserId == currentUserId }
                TaskScope.UNASSIGNED -> result.filter { it.assignedUserId == null }
            }
        }
        if (hideTerminalTasks) {
            result = result.filter { it.status != TaskStatus.DONE && it.status != TaskStatus.CANCELLED }
        }
        if (statusFilter.isNotEmpty()) {
            result = result.filter { it.status in statusFilter }
        }
        if (priorityFilter.isNotEmpty()) {
            result = result.filter { it.priority in priorityFilter }
        }
        if (searchQuery.isNotBlank()) {
            val query = searchQuery.lowercase()
            result = result.filter { task ->
                task.taskNumber.lowercase().contains(query) ||
                task.title.lowercase().contains(query) ||
                task.address.lowercase().contains(query) ||
                task.description.lowercase().contains(query)
            }
        }
        return result.sortedBy(sortOrder, myLocationLat, myLocationLon)
    }
}

/**
 * ViewModel для экрана карты с заявками.
 * Управляет загрузкой задач и состоянием UI.
 * Поддерживает offline-режим с кешированием в Room.
 *
 * Использует UseCase классы для бизнес-логики:
 * - GetTasksUseCase: загрузка и кеширование задач
 * - UpdateTaskStatusUseCase: изменение статуса
 * - TaskPhotosUseCase: работа с фото
 * - TaskCommentsUseCase: работа с комментариями
 */
@HiltViewModel
class MapViewModel @Inject constructor(
    private val getTasksUseCase: GetTasksUseCase,
    private val updateTaskStatusUseCase: UpdateTaskStatusUseCase,
    private val taskPhotosUseCase: TaskPhotosUseCase,
    private val taskCommentsUseCase: TaskCommentsUseCase,
    private val addressRepository: AddressRepository,
    private val usersRepository: UsersRepository,
    private val networkMonitor: NetworkMonitor,
    private val syncManager: SyncManager,
    val preferences: AppPreferences,
    val authRepository: com.fieldworker.data.repository.AuthRepository,
    private val serverHealthCheck: ServerHealthCheck,
) : ViewModel() {

    private val _uiState = MutableStateFlow(MapUiState())
    val uiState: StateFlow<MapUiState> = _uiState.asStateFlow()

    // Фильтрация пересчитывается только при изменении задач/фильтров, а не при
    // изменении isLoading, selectedTask и прочих несвязанных полей.
    val filteredTasks: StateFlow<List<Task>> = _uiState
        .map { it.filterInput() }
        .distinctUntilChanged()
        .map { it.apply() }
        .flowOn(Dispatchers.Default)
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /**
     * Paging 3 Flow задач для TaskListScreen.
     * cachedIn(viewModelScope) сохраняет данные при смене конфигурации.
     */
    val tasksPagingFlow: kotlinx.coroutines.flow.Flow<PagingData<Task>> =
        getTasksUseCase.tasksPagingFlow.cachedIn(viewModelScope)

    private val _connectionStatus = MutableStateFlow<ConnectionStatus>(ConnectionStatus.IDLE)
    val connectionStatus: StateFlow<ConnectionStatus> = _connectionStatus.asStateFlow()


    private var photosJob: Job? = null

    // Circuit breaker для проверки /health: после 5 подряд неудач интервал растёт до 5 минут
    private var serverCheckFailures = 0
    private val serverCheckCircuitOpenThreshold = 5
    private val serverCheckCircuitOpenIntervalMs = 5 * 60_000L
    // Видимость знает только UI: MainScreen шлёт ON_START/ON_STOP, причём
    // наблюдатель сразу получает ON_START при подписке. До этого (и в юнит-тестах,
    // где UI нет) бесконечный опрос /health не запускается.
    private val appInForeground = MutableStateFlow(false)

    private companion object {
        /** Сколько ждём проверку сессии, прежде чем считать сервер недоступным. */
        const val SESSION_CHECK_TIMEOUT_MS = 8_000L
    }

    init {
        // Загружаем сохранённые фильтры
        loadSavedFilters()
        refreshAccess()

        // Подписываемся на изменения данных из Room
        observeTasksFromDatabase()

        // Подписываемся на состояние сети + доступность сервера
        observeNetworkStatus()
        startServerReachabilityCheck()
        reloadDetailsWhenBackOnline()

        // Подписываемся на pending actions
        observePendingActions()
        observePendingPhotos()

        // Слушаем изменения фильтров из настроек
        observePreferencesChanges()

        // Запускаем периодическую синхронизацию
        syncManager.startPeriodicSync()

        // Валидируем сессию пользователя при запуске, потом загружаем данные
        viewModelScope.launch {
            validateUserSessionAndLoadTasks()
        }
    }

    private fun observePreferencesChanges() {
        viewModelScope.launch {
            combine(
                preferences.statusFilter,
                preferences.priorityFilter,
                preferences.showMyLocation,
                preferences.hideDoneTasks,
            ) { statusFilter, priorityFilter, showMyLocation, hideDone ->
                _uiState.update {
                    it.copy(
                        statusFilter = statusFilter,
                        priorityFilter = priorityFilter,
                        showMyLocation = showMyLocation,
                        hideTerminalTasks = hideDone,
                    )
                }
            }.collect {}
        }
    }

    /**
     * Подписаться на изменения задач из Room
     * ВАЖНО: Не показываем данные из кеша пока сессия не проверена!
     */
    private fun observeTasksFromDatabase() {
        viewModelScope.launch {
            getTasksUseCase.tasksFlow
                .distinctUntilChanged()
                .collect { tasks ->
                    // Offline-first: кеш показываем сразу, не дожидаясь сервера.
                    // Недействительная сессия очистит его (validateUserSession…).
                    _uiState.update { it.copy(tasks = tasks) }
                }
        }
    }

    /**
     * Отслеживать состояние сети
     */
    private fun observeNetworkStatus() {
        viewModelScope.launch {
            networkMonitor.isOnline.collect { isOnline ->
                if (!isOnline) {
                    // Нет сети — точно офлайн
                    _uiState.update { it.copy(isOffline = true) }
                } else {
                    // Сеть появилась — проверяем доступность сервера
                    val wasOffline = _uiState.value.isOffline
                    val reachable = serverHealthCheck.isReachable()
                    _uiState.update { it.copy(isOffline = !reachable) }
                    if (reachable || wasOffline) {
                        syncManager.triggerImmediateSync()
                    }
                }
            }
        }
    }

    /**
     * Периодическая проверка доступности сервера (каждые 15с пока офлайн, 60с онлайн).
     * Circuit breaker: после 5 подряд неудач переходит на 5-минутный интервал,
     * чтобы не спамить запросами при длительно недоступном сервере.
     */
    private fun startServerReachabilityCheck() {
        viewModelScope.launch {
            // Опрашиваем только пока приложение на экране: в фоне VM жива, и
            // пинг раз в минуту зря будил бы радио. Сворачивание отменяет и
            // стартовую паузу, и цикл — фоновой работы не остаётся.
            appInForeground.collectLatest { inForeground ->
                if (!inForeground) return@collectLatest
                // Пауза 2с — дать UI загрузиться (и после возврата из фона)
                withContext(Dispatchers.IO) { delay(2_000L) }
                while (currentCoroutineContext().isActive) {
                    val interval: Long
                    try {
                        if (networkMonitor.isCurrentlyOnline()) {
                            val reachable = serverHealthCheck.isReachable()
                            val wasOffline = _uiState.value.isOffline
                            _uiState.update { it.copy(isOffline = !reachable) }
                            if (reachable) {
                                serverCheckFailures = 0
                                if (wasOffline) syncManager.triggerImmediateSync()
                            } else {
                                serverCheckFailures++
                            }
                        }
                        interval = when {
                            serverCheckFailures >= serverCheckCircuitOpenThreshold -> serverCheckCircuitOpenIntervalMs
                            _uiState.value.isOffline -> 15_000L
                            else -> 60_000L
                        }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Throwable) {
                        // В тестах моки могут быть освобождены раньше жизненного цикла VM.
                        break
                    }
                    withContext(Dispatchers.IO) { delay(interval) }
                }
            }
        }
    }

    /** Вызывается из UI на ON_START/ON_STOP. */
    fun setAppInForeground(inForeground: Boolean) {
        appInForeground.value = inForeground
    }

    /**
     * Отслеживать количество отложенных действий
     */
    private fun observePendingActions() {
        viewModelScope.launch {
            getTasksUseCase.pendingActionsCount.collect { count ->
                _uiState.update { it.copy(pendingActionsCount = count) }
            }
        }
        viewModelScope.launch {
            getTasksUseCase.failedActions.collect { failed ->
                _uiState.update {
                    it.copy(
                        failedActions = failed,
                        // Разобрали всё — диалог больше не нужен
                        showFailedActions = it.showFailedActions && failed.isNotEmpty()
                    )
                }
            }
        }
    }

    fun showFailedActions() {
        _uiState.update { it.copy(showFailedActions = it.failedActions.isNotEmpty()) }
    }

    fun hideFailedActions() {
        _uiState.update { it.copy(showFailedActions = false) }
    }

    fun retryFailedAction(actionId: Long) {
        viewModelScope.launch {
            val result = getTasksUseCase.retryFailedAction(actionId)
            if (result.permanentFailures > 0 || result.retryableFailures > 0) {
                _uiState.update { it.copy(error = "Отправить не удалось — действие осталось в списке") }
            }
        }
    }

    fun discardFailedAction(actionId: Long) {
        viewModelScope.launch {
            getTasksUseCase.discardFailedAction(actionId)
        }
    }

    private fun loadSavedFilters() {
        _uiState.update {
            it.copy(
                statusFilter = preferences.statusFilter.value,
                priorityFilter = preferences.priorityFilter.value,
                showMyLocation = preferences.showMyLocation.value,
                hideTerminalTasks = preferences.hideDoneTasks.value,
            )
        }
    }

    /**
     * Валидация сессии пользователя и загрузка данных.
     * Сначала проверяем сессию, потом загружаем задачи.
     * Если сессия невалидна - вызывает logout БЕЗ загрузки данных.
     */
    private suspend fun validateUserSessionAndLoadTasks() {
        _uiState.update { it.copy(isLoading = true) }

        // Без сети спрашивать сервер бессмысленно; с сетью — не дольше
        // SESSION_CHECK_TIMEOUT_MS: недоступный сервер не должен держать экран.
        val validation = if (!networkMonitor.isCurrentlyOnline()) {
            com.fieldworker.data.repository.AuthRepository.ValidationResult.UNKNOWN
        } else {
            withTimeoutOrNull(SESSION_CHECK_TIMEOUT_MS) { authRepository.validateCurrentUser() }
                ?: com.fieldworker.data.repository.AuthRepository.ValidationResult.UNKNOWN
        }

        when (validation) {
            com.fieldworker.data.repository.AuthRepository.ValidationResult.INVALID -> {
                android.util.Log.w("MapViewModel", "User session invalid, clearing cache and triggering logout")
                getTasksUseCase.clearCache(keepOutbox = true)
                _uiState.update { it.copy(isLoading = false, tasks = emptyList()) }
                preferences.triggerLogout()
                return  // НЕ загружаем данные и НЕ разрешаем показ кеша!
            }
            com.fieldworker.data.repository.AuthRepository.ValidationResult.UNKNOWN -> {
                android.util.Log.d("MapViewModel", "Cannot validate session (network error), loading from cache")
            }
            com.fieldworker.data.repository.AuthRepository.ValidationResult.VALID -> {
                android.util.Log.d("MapViewModel", "User session is valid")
            }
        }

        // validateCurrentUser() синхронизирует role/base_access — перечитываем доступ
        refreshAccess()
        loadPermissions()

        // Загружаем задачи
        loadTasksInternal()
    }

    /**
     * Внутренняя функция загрузки задач (без проверки сессии)
     */
    private suspend fun loadTasksInternal() {
        getTasksUseCase.refreshTasks()
            .onSuccess { tasks ->
                val lastSync = getTasksUseCase.getLastSyncTime()
                _uiState.update {
                    it.copy(
                        tasks = tasks,
                        isLoading = false,
                        error = null,
                        lastSyncTime = lastSync
                    )
                }
            }
            .onFailure { exception ->
                val errorMessage = exception.message ?: "Неизвестная ошибка"

                // Если сессия истекла - вызываем logout
                if (errorMessage.contains("Сессия истекла") || errorMessage.contains("401")) {
                    android.util.Log.w("MapViewModel", "Session expired during loadTasks, triggering logout")
                    preferences.triggerLogout()
                }

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = errorMessage
                    )
                }
            }
    }

    /**
     * Загрузить список задач (из кеша или сервера)
     */
    fun loadTasks() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            loadTasksInternal()
        }
    }

    /**
     * Принудительная синхронизация
     */
    fun forceSync() {
        syncManager.triggerImmediateSync()
        loadTasks()
    }

    /**
     * Выбрать задачу и загрузить её детали
     */
    fun selectTask(task: Task?) {
        _uiState.update {
            it.copy(
                selectedTask = task,
                comments = emptyList(),
                photos = emptyList(),
                addressDetails = null,
                isLoadingAddress = task != null,
                hasAttemptedAddressLookup = false,
                unavailableDetails = emptySet()
            )
        }

        task?.let {
            loadTaskDetails(it.id)
            loadTaskPhotos(it.id)
            loadAddressDetails(it)
        }
    }

    fun openTaskFromNotification(taskId: Long) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = true,
                    selectedTask = null,
                    comments = emptyList(),
                    photos = emptyList(),
                    addressDetails = null,
                    isLoadingComments = true,
                    isLoadingPhotos = true,
                    isLoadingAddress = true,
                    hasAttemptedAddressLookup = false,
                    unavailableDetails = emptySet()
                )
            }

            getTasksUseCase.getTaskDetail(taskId)
                .onSuccess { (task, comments) ->
                    _uiState.update { state ->
                        val updatedTasks = if (state.tasks.any { it.id == task.id }) {
                            state.tasks.map { existingTask ->
                                if (existingTask.id == task.id) task else existingTask
                            }
                        } else {
                            state.tasks + task
                        }

                        state.copy(
                            tasks = updatedTasks,
                            selectedTask = task,
                            comments = comments,
                            isLoading = false,
                            isLoadingComments = false
                        )
                    }
                    loadTaskPhotos(taskId)
                    loadAddressDetails(task)
                }
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isLoadingComments = false,
                            isLoadingPhotos = false,
                            isLoadingAddress = false,
                            error = exception.message ?: "Не удалось открыть заявку из уведомления"
                        )
                    }
                }
        }
    }

    /**
     * Загрузить детали задачи с комментариями.
     *
     * Без связи с сервером — сразу из кеша: раньше карточка ждала таймауты
     * подключения, чтобы показать тот же сохранённый список. Ответ, пришедший
     * после закрытия карточки (или открытия другой), отбрасывается — иначе
     * поздний ответ заново открывал шторку.
     */
    private fun loadTaskDetails(taskId: Long) {
        viewModelScope.launch {
            val offline = _uiState.value.isOffline
            _uiState.update { it.copy(isLoadingComments = true) }

            val result = if (offline) {
                getTasksUseCase.getCachedTaskDetail(taskId)
            } else {
                getTasksUseCase.getTaskDetail(taskId)
            }
            val shown = _uiState.value.selectedTask
            if (shown == null || shown.id != taskId) return@launch

            result
                .onSuccess { (task, comments) ->
                    _uiState.update {
                        it.copy(
                            selectedTask = task,
                            comments = comments,
                            isLoadingComments = false,
                            unavailableDetails = it.unavailableDetails.mark(TaskDetailSection.HISTORY, offline)
                        )
                    }
                    // Объект ищем по адресу — перезапрашиваем, только если он уточнился
                    if (task.address != shown.address) loadAddressDetails(task)
                }
                .onFailure {
                    _uiState.update { it.copy(isLoadingComments = false) }
                }
        }
    }

    private fun loadAddressDetails(task: Task) {
        viewModelScope.launch {
            if (_uiState.value.isOffline) {
                // Адресная база живёт только на сервере: без связи честно
                // «недоступно», а не «объект не найден» после минуты ожидания.
                _uiState.update {
                    it.copy(
                        addressDetails = null,
                        isLoadingAddress = false,
                        hasAttemptedAddressLookup = true,
                        unavailableDetails = it.unavailableDetails + TaskDetailSection.OBJECT
                    )
                }
                return@launch
            }
            _uiState.update { it.copy(isLoadingAddress = true, hasAttemptedAddressLookup = true) }

            val result = addressRepository.findAddressForTask(task)
            if (_uiState.value.selectedTask?.id != task.id) return@launch
            _uiState.update {
                it.copy(
                    addressDetails = result.getOrNull(),
                    isLoadingAddress = false,
                    hasAttemptedAddressLookup = true,
                    // success(null) — объекта в базе нет; failure — не смогли спросить
                    unavailableDetails = it.unavailableDetails.mark(TaskDetailSection.OBJECT, result.isFailure)
                )
            }
        }
    }

    /**
     * Загрузить фотографии задачи
     */
    private fun loadTaskPhotos(taskId: Long) {
        // Новый запрос отменяет прежний: поздний старый ответ не затрёт свежий список
        photosJob?.cancel()
        photosJob = viewModelScope.launch {
            if (_uiState.value.isOffline) {
                // Фото не кешируются — без связи не ждём таймаут, а помечаем раздел
                _uiState.update {
                    it.copy(
                        isLoadingPhotos = false,
                        unavailableDetails = it.unavailableDetails + TaskDetailSection.PHOTOS
                    )
                }
                return@launch
            }
            _uiState.update { it.copy(isLoadingPhotos = true) }

            val result = taskPhotosUseCase.getPhotos(taskId)
            // Фото прошлой заявки не должны попасть в карточку новой
            if (_uiState.value.selectedTask?.id != taskId) return@launch
            _uiState.update {
                it.copy(
                    photos = result.getOrNull() ?: it.photos,
                    isLoadingPhotos = false,
                    unavailableDetails = it.unavailableDetails.mark(TaskDetailSection.PHOTOS, result.isFailure)
                )
            }
        }
    }

    /**
     * Связь вернулась, а открытая карточка показывает «нет подключения» —
     * догружаем эти разделы, не заставляя переоткрывать заявку.
     */
    private fun reloadDetailsWhenBackOnline() {
        viewModelScope.launch {
            _uiState.map { it.isOffline }
                .distinctUntilChanged()
                .collect { offline ->
                    val state = _uiState.value
                    val task = state.selectedTask
                    if (offline || task == null) return@collect
                    val missing = state.unavailableDetails
                    if (TaskDetailSection.HISTORY in missing) loadTaskDetails(task.id)
                    if (TaskDetailSection.PHOTOS in missing) loadTaskPhotos(task.id)
                    if (TaskDetailSection.OBJECT in missing) loadAddressDetails(task)
                }
        }
    }

    private fun Set<TaskDetailSection>.mark(section: TaskDetailSection, unavailable: Boolean) =
        if (unavailable) this + section else this - section

    /**
     * Снимки выбранной заявки из очереди отправки. Когда снимок уходит на
     * сервер, перечитываем фото — локальную миниатюру сменяет серверная.
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    private fun observePendingPhotos() {
        viewModelScope.launch {
            _uiState.map { it.selectedTask?.id }
                .distinctUntilChanged()
                .flatMapLatest { taskId ->
                    if (taskId == null) {
                        flowOf(emptyList())
                    } else {
                        taskPhotosUseCase.pendingPhotos(taskId)
                    }
                }
                .collect { pending ->
                    val state = _uiState.value
                    val taskId = state.selectedTask?.id
                    val left = state.pendingPhotos.any { old ->
                        old.taskId == taskId && pending.none { it.id == old.id }
                    }
                    _uiState.update { it.copy(pendingPhotos = pending) }
                    // Без связи loadTaskPhotos пометит раздел — догрузится при её возврате
                    if (taskId != null && left) loadTaskPhotos(taskId)
                }
        }
    }

    /**
     * Добавить фото к заявке: снимок встаёт в очередь (переживёт отсутствие
     * связи и перезапуск) и, если сервер доступен, сразу уходит.
     */
    fun uploadPhoto(taskId: Long, imageUri: Uri, photoType: String = "completion") {
        viewModelScope.launch {
            _uiState.update { it.copy(isUploadingPhoto = true) }

            taskPhotosUseCase.enqueuePhoto(taskId, imageUri, photoType)
                .onSuccess {
                    _uiState.update { it.copy(isUploadingPhoto = false) }
                    // Без сервера не тратим попытки очереди — отправит возврат связи.
                    // Не ушло сразу (слабая связь) — повторит фоновая синхронизация.
                    if (!_uiState.value.isOffline && !taskPhotosUseCase.sendPending()) {
                        syncManager.triggerImmediateSync()
                    }
                }
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(
                            isUploadingPhoto = false,
                            error = exception.message ?: "Не удалось сохранить фото"
                        )
                    }
                }
        }
    }

    /** Отказаться от снимка, который ещё не ушёл на сервер. */
    fun cancelPendingPhoto(pendingPhotoId: Long) {
        viewModelScope.launch {
            taskPhotosUseCase.cancelPendingPhoto(pendingPhotoId)
        }
    }

    /**
     * Удалить фото
     */
    fun deletePhoto(photoId: Long) {
        viewModelScope.launch {
            taskPhotosUseCase.deletePhoto(photoId)
                .onSuccess {
                    _uiState.update {
                        it.copy(photos = it.photos.filter { p -> p.id != photoId })
                    }
                }
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(error = exception.message ?: "Ошибка удаления фото")
                    }
                }
        }
    }

    /**
     * Показать диалог смены статуса. [target] задан, когда переход уже выбран
     * кнопкой следующего шага: диалог не предлагает варианты, а подтверждает.
     */
    fun showStatusDialog(target: TaskStatus? = null) {
        _uiState.update { it.copy(showStatusDialog = true, statusDialogTarget = target) }
    }

    /**
     * Скрыть диалог выбора статуса
     */
    fun hideStatusDialog() {
        _uiState.update { it.copy(showStatusDialog = false, statusDialogTarget = null) }
    }

    /**
     * Обновить статус задачи с комментарием
     */
    fun updateTaskStatus(taskId: Long, newStatus: TaskStatus, comment: String = "") {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, showStatusDialog = false, statusDialogTarget = null) }

            updateTaskStatusUseCase(taskId, newStatus, comment)
                .onSuccess { updatedTask ->
                    _uiState.update { state ->
                        val updatedTasks = state.tasks.map { task ->
                            if (task.id == updatedTask.id) updatedTask else task
                        }
                        state.copy(
                            tasks = updatedTasks,
                            isLoading = false,
                            selectedTask = updatedTask,
                            statusUpdateSuccess = true
                        )
                    }
                    // Перезагрузить комментарии
                    loadTaskDetails(taskId)
                }
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = exception.message ?: "Ошибка обновления статуса"
                        )
                    }
                }
        }
    }

    /**
     * Добавить комментарий к задаче
     */
    fun addComment(taskId: Long, text: String) {
        if (text.isBlank()) return

        viewModelScope.launch {
            taskCommentsUseCase.addComment(taskId, text)
                .onSuccess {
                    // Перезагрузить комментарии
                    loadTaskDetails(taskId)
                }
                .onFailure { _ ->
                    _uiState.update {
                        it.copy(error = "Ошибка добавления комментария")
                    }
                }
        }
    }

    /**
     * Обновить планируемую дату выполнения задачи
     */
    fun updatePlannedDate(taskId: Long, plannedDate: String?) {
        viewModelScope.launch {
            getTasksUseCase.updatePlannedDate(taskId, plannedDate)
                .onSuccess { updatedTask ->
                    _uiState.update { state ->
                        val updatedTasks = state.tasks.map { task ->
                            if (task.id == updatedTask.id) updatedTask else task
                        }
                        state.copy(
                            tasks = updatedTasks,
                            selectedTask = updatedTask
                        )
                    }
                    // Перезагрузить комментарии для отображения записи об изменении
                    loadTaskDetails(taskId)
                }
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(error = exception.message ?: "Ошибка обновления даты")
                    }
                }
        }
    }

    private fun refreshAccess() {
        val access = AccessLevel.resolve(preferences.getUserRole(), preferences.getBaseAccess())
        _uiState.update {
            it.copy(
                access = access,
                currentUserId = preferences.getUserId(),
                // До ответа /auth/permissions — по уровню доступа
                canAssignTasks = access.canManageTasks,
            )
        }
    }

    /**
     * Тонкие права (матрица прав организации): кастомная группа диспетчеров
     * может не иметь assign_tasks. Без сети остаёмся на оценке по уровню доступа.
     */
    private fun loadPermissions() {
        if (!_uiState.value.canManageTasks) return
        viewModelScope.launch {
            authRepository.getMyPermissions().onSuccess { permissions ->
                _uiState.update { state ->
                    state.copy(canAssignTasks = permissions["assign_tasks"] ?: state.canManageTasks)
                }
            }
        }
    }

    fun setTaskScope(scope: TaskScope) {
        _uiState.update { it.copy(taskScope = scope) }
    }

    fun showAssignDialog() {
        if (!_uiState.value.canAssignTasks) return
        _uiState.update { it.copy(showAssignDialog = true) }
        if (_uiState.value.workers.isNotEmpty() || _uiState.value.isLoadingWorkers) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingWorkers = true) }
            usersRepository.getAssignableWorkers()
                .onSuccess { workers ->
                    _uiState.update { it.copy(workers = workers, isLoadingWorkers = false) }
                }
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(
                            isLoadingWorkers = false,
                            showAssignDialog = false,
                            error = exception.message ?: "Не удалось загрузить исполнителей"
                        )
                    }
                }
        }
    }

    fun hideAssignDialog() {
        _uiState.update { it.copy(showAssignDialog = false) }
    }

    /**
     * Назначить исполнителя (null — снять назначение)
     */
    fun assignTask(taskId: Long, assigneeId: Long?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isAssigning = true) }
            getTasksUseCase.assignTask(taskId, assigneeId)
                .onSuccess { updatedTask ->
                    _uiState.update { state ->
                        state.copy(
                            tasks = state.tasks.map { if (it.id == updatedTask.id) updatedTask else it },
                            selectedTask = updatedTask.takeIf { state.selectedTask?.id == it.id }
                                ?: state.selectedTask,
                            isAssigning = false,
                            showAssignDialog = false
                        )
                    }
                    loadTaskDetails(taskId)
                }
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(
                            isAssigning = false,
                            error = exception.message ?: "Ошибка назначения"
                        )
                    }
                }
        }
    }

    /**
     * Очистить ошибку
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    /**
     * Сбросить флаг успешного обновления
     */
    fun clearStatusUpdateSuccess() {
        _uiState.update { it.copy(statusUpdateSuccess = false) }
    }

    // ================== Фильтрация / Сортировка / Местоположение ==================

    fun setStatusFilter(filter: Set<TaskStatus>) {
        _uiState.update { it.copy(statusFilter = filter) }
        preferences.setStatusFilter(filter)
    }

    fun setPriorityFilter(filter: Set<Priority>) {
        _uiState.update { it.copy(priorityFilter = filter) }
        preferences.setPriorityFilter(filter)
    }

    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun clearFilters() {
        _uiState.update { it.copy(statusFilter = emptySet(), priorityFilter = emptySet(), searchQuery = "") }
        preferences.setStatusFilter(emptySet())
        preferences.setPriorityFilter(emptySet())
    }

    fun setSortOrder(order: TaskSortOrder) {
        _uiState.update { it.copy(sortOrder = order) }
    }

    /**
     * Обновить моё местоположение
     */
    fun updateMyLocation(lat: Double, lon: Double) {
        _uiState.update { it.copy(myLocationLat = lat, myLocationLon = lon) }
    }

    fun saveMapPosition(lat: Double, lon: Double, zoom: Double) {
        preferences.saveMapPosition(lat, lon, zoom)
    }

    fun getSavedMapPosition(): Triple<Double, Double, Double>? =
        preferences.getSavedMapPosition()

    // ================== Подключение ==================

    /**
     * Тестировать подключение к серверу
     */
    fun testConnection(url: String) {
        viewModelScope.launch {
            _connectionStatus.value = ConnectionStatus.TESTING

            try {
                val result = withContext(Dispatchers.IO) {
                    val baseUrl = url.trimEnd('/')
                    val healthUrl = if (baseUrl.endsWith("/health")) baseUrl else "$baseUrl/health"
                    val connection = URL(healthUrl).openConnection() as HttpURLConnection
                    connection.connectTimeout = 5000
                    connection.readTimeout = 5000
                    connection.requestMethod = "GET"

                    try {
                        connection.connect()
                        connection.responseCode == HttpURLConnection.HTTP_OK
                    } finally {
                        connection.disconnect()
                    }
                }

                _connectionStatus.value = if (result) {
                    ConnectionStatus.SUCCESS
                } else {
                    ConnectionStatus.ERROR("Сервер не отвечает")
                }
            } catch (e: Exception) {
                _connectionStatus.value = ConnectionStatus.ERROR(
                    e.message ?: "Ошибка подключения"
                )
            }
        }
    }
}
