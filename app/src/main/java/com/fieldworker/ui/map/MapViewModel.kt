package com.fieldworker.ui.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.data.network.NetworkMonitor
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.sync.SyncManager
import android.net.Uri
import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskPhoto
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.domain.usecase.GetTasksUseCase
import com.fieldworker.domain.usecase.TaskCommentsUseCase
import com.fieldworker.domain.usecase.TaskPhotosUseCase
import com.fieldworker.domain.usecase.UpdateTaskStatusUseCase
import com.fieldworker.ui.settings.ConnectionStatus
import com.fieldworker.ui.utils.TaskSortOrder
import com.fieldworker.ui.utils.sortedBy
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject

/**
 * UI State для экрана карты и списка
 */
data class MapUiState(
    val tasks: List<Task> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedTask: Task? = null,
    val comments: List<Comment> = emptyList(),
    val isLoadingComments: Boolean = false,
    val showStatusDialog: Boolean = false,
    val statusUpdateSuccess: Boolean = false,
    // Фотографии
    val photos: List<TaskPhoto> = emptyList(),
    val isLoadingPhotos: Boolean = false,
    val isUploadingPhoto: Boolean = false,
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
    // Количество новых заявок (для бейджа)
    val newTasksCount: Int = 0,
    // Offline режим
    val isOffline: Boolean = false,
    val pendingActionsCount: Int = 0,
    val lastSyncTime: Long? = null
) {
    /**
     * Задачи с применёнными фильтрами и сортировкой
     */
    val filteredTasks: List<Task>
        get() {
            var result = tasks
            
            // Фильтр по статусу
            if (statusFilter.isNotEmpty()) {
                result = result.filter { it.status in statusFilter }
            }
            
            // Фильтр по приоритету
            if (priorityFilter.isNotEmpty()) {
                result = result.filter { it.priority in priorityFilter }
            }
            
            // Поиск по тексту (включая номер заявки)
            if (searchQuery.isNotBlank()) {
                val query = searchQuery.lowercase()
                result = result.filter { task ->
                    task.taskNumber.lowercase().contains(query) ||
                    task.title.lowercase().contains(query) ||
                    task.address.lowercase().contains(query) ||
                    task.description.lowercase().contains(query)
                }
            }
            
            // Применяем сортировку
            result = result.sortedBy(sortOrder, myLocationLat, myLocationLon)
            
            return result
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
    private val networkMonitor: NetworkMonitor,
    private val syncManager: SyncManager,
    val preferences: AppPreferences,
    val authRepository: com.fieldworker.data.repository.AuthRepository
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(MapUiState())
    val uiState: StateFlow<MapUiState> = _uiState.asStateFlow()
    
    private val _connectionStatus = MutableStateFlow<ConnectionStatus>(ConnectionStatus.IDLE)
    val connectionStatus: StateFlow<ConnectionStatus> = _connectionStatus.asStateFlow()
    
    // Флаг: сессия проверена (блокирует отображение кеша до валидации)
    private var sessionValidated = false
    
    init {
        // Загружаем сохранённые фильтры
        loadSavedFilters()
        
        // Подписываемся на изменения данных из Room
        observeTasksFromDatabase()
        
        // Подписываемся на состояние сети
        observeNetworkStatus()
        
        // Подписываемся на pending actions
        observePendingActions()
        
        // Слушаем изменения фильтров из настроек
        observePreferencesChanges()
        
        // Запускаем периодическую синхронизацию
        syncManager.startPeriodicSync()
        
        // Валидируем сессию пользователя при запуске, потом загружаем данные
        viewModelScope.launch {
            validateUserSessionAndLoadTasks()
        }
    }
    
    /**
     * Наблюдать за изменениями настроек фильтрации
     */
    private fun observePreferencesChanges() {
        viewModelScope.launch {
            preferences.statusFilter.collect { statusFilter ->
                _uiState.update { it.copy(statusFilter = statusFilter) }
            }
        }
        viewModelScope.launch {
            preferences.priorityFilter.collect { priorityFilter ->
                _uiState.update { it.copy(priorityFilter = priorityFilter) }
            }
        }
        viewModelScope.launch {
            preferences.showMyLocation.collect { showMyLocation ->
                _uiState.update { it.copy(showMyLocation = showMyLocation) }
            }
        }
    }
    
    /**
     * Подписаться на изменения задач из Room
     * ВАЖНО: Не показываем данные из кеша пока сессия не проверена!
     */
    private fun observeTasksFromDatabase() {
        viewModelScope.launch {
            getTasksUseCase.tasksFlow.collect { tasks ->
                // Блокируем показ кеша до проверки сессии
                if (sessionValidated) {
                    _uiState.update { it.copy(tasks = tasks) }
                }
            }
        }
    }
    
    /**
     * Отслеживать состояние сети
     */
    private fun observeNetworkStatus() {
        viewModelScope.launch {
            networkMonitor.isOnline.collect { isOnline ->
                _uiState.update { it.copy(isOffline = !isOnline) }
                
                // При появлении сети запускаем синхронизацию
                if (isOnline) {
                    syncManager.triggerImmediateSync()
                }
            }
        }
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
    }
    
    /**
     * Загрузить сохранённые фильтры из настроек
     */
    private fun loadSavedFilters() {
        _uiState.update { 
            it.copy(
                statusFilter = preferences.getStatusFilter(),
                priorityFilter = preferences.getPriorityFilter(),
                showMyLocation = preferences.getShowMyLocation()
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
        
        when (authRepository.validateCurrentUser()) {
            com.fieldworker.data.repository.AuthRepository.ValidationResult.INVALID -> {
                android.util.Log.w("MapViewModel", "User session invalid, clearing cache and triggering logout")
                getTasksUseCase.clearCache()
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
        
        // Сессия валидна или неизвестна (offline) - разрешаем показ данных
        sessionValidated = true
        
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
        _uiState.update { it.copy(selectedTask = task, comments = emptyList(), photos = emptyList()) }
        
        task?.let { 
            loadTaskDetails(it.id)
            loadTaskPhotos(it.id)
        }
    }
    
    /**
     * Загрузить детали задачи с комментариями
     */
    private fun loadTaskDetails(taskId: Long) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingComments = true) }
            
            getTasksUseCase.getTaskDetail(taskId)
                .onSuccess { (task, comments) ->
                    _uiState.update {
                        it.copy(
                            selectedTask = task,
                            comments = comments,
                            isLoadingComments = false
                        )
                    }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoadingComments = false) }
                }
        }
    }
    
    /**
     * Загрузить фотографии задачи
     */
    private fun loadTaskPhotos(taskId: Long) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingPhotos = true) }
            
            taskPhotosUseCase.getPhotos(taskId)
                .onSuccess { photos ->
                    _uiState.update {
                        it.copy(
                            photos = photos,
                            isLoadingPhotos = false
                        )
                    }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoadingPhotos = false) }
                }
        }
    }
    
    /**
     * Загрузить фото к заявке
     */
    fun uploadPhoto(taskId: Long, imageUri: Uri, photoType: String = "completion") {
        viewModelScope.launch {
            _uiState.update { it.copy(isUploadingPhoto = true) }
            
            taskPhotosUseCase.uploadPhoto(taskId, imageUri, photoType)
                .onSuccess { photo ->
                    _uiState.update {
                        it.copy(
                            photos = it.photos + photo,
                            isUploadingPhoto = false
                        )
                    }
                }
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(
                            isUploadingPhoto = false,
                            error = exception.message ?: "Ошибка загрузки фото"
                        )
                    }
                }
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
     * Показать диалог выбора статуса
     */
    fun showStatusDialog() {
        _uiState.update { it.copy(showStatusDialog = true) }
    }
    
    /**
     * Скрыть диалог выбора статуса
     */
    fun hideStatusDialog() {
        _uiState.update { it.copy(showStatusDialog = false) }
    }
    
    /**
     * Обновить статус задачи с комментарием
     */
    fun updateTaskStatus(taskId: Long, newStatus: TaskStatus, comment: String = "") {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, showStatusDialog = false) }
            
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
                .onFailure { exception ->
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
    
    // ================== Фильтрация ==================
    
    /**
     * Установить фильтр по статусам
     */
    fun setStatusFilter(filter: Set<TaskStatus>) {
        _uiState.update { it.copy(statusFilter = filter) }
        preferences.setStatusFilter(filter)
    }
    
    /**
     * Установить фильтр по приоритетам
     */
    fun setPriorityFilter(filter: Set<Priority>) {
        _uiState.update { it.copy(priorityFilter = filter) }
        preferences.setPriorityFilter(filter)
    }
    
    /**
     * Установить поисковый запрос
     */
    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }
    
    /**
     * Сбросить все фильтры
     */
    fun clearFilters() {
        _uiState.update { 
            it.copy(
                statusFilter = emptySet(),
                priorityFilter = emptySet(),
                searchQuery = ""
            )
        }
        preferences.setStatusFilter(emptySet())
        preferences.setPriorityFilter(emptySet())
    }
    
    // ================== Сортировка ==================
    
    /**
     * Установить порядок сортировки
     */
    fun setSortOrder(order: TaskSortOrder) {
        _uiState.update { it.copy(sortOrder = order) }
    }
    
    // ================== Местоположение ==================
    
    /**
     * Обновить моё местоположение
     */
    fun updateMyLocation(lat: Double, lon: Double) {
        _uiState.update { it.copy(myLocationLat = lat, myLocationLon = lon) }
    }
    
    /**
     * Переключить отображение местоположения
     */
    fun toggleShowMyLocation(show: Boolean) {
        _uiState.update { it.copy(showMyLocation = show) }
        preferences.setShowMyLocation(show)
    }
    
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
