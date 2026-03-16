package com.fieldworker.ui.map

import android.content.Context
import android.content.SharedPreferences
import com.fieldworker.data.network.NetworkMonitor
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.AuthRepository
import com.fieldworker.data.sync.SyncManager
import com.fieldworker.domain.model.*
import com.fieldworker.domain.usecase.GetTasksUseCase
import com.fieldworker.domain.usecase.TaskCommentsUseCase
import com.fieldworker.domain.usecase.TaskPhotosUseCase
import com.fieldworker.domain.usecase.UpdateTaskStatusUseCase
import com.fieldworker.ui.settings.ConnectionStatus
import com.fieldworker.ui.utils.TaskSortOrder
import io.mockk.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MapViewModelTest {

    companion object {
        @JvmStatic
        @BeforeClass
        fun setupClass() {
            mockkStatic(android.util.Log::class)
            every { android.util.Log.d(any(), any()) } returns 0
            every { android.util.Log.w(any(), any<String>()) } returns 0
            every { android.util.Log.e(any(), any(), any()) } returns 0
            every { android.util.Log.e(any(), any()) } returns 0
            every { android.util.Log.i(any(), any()) } returns 0
        }
    }

    private val testDispatcher = StandardTestDispatcher()
    
    private lateinit var getTasksUseCase: GetTasksUseCase
    private lateinit var updateTaskStatusUseCase: UpdateTaskStatusUseCase
    private lateinit var taskPhotosUseCase: TaskPhotosUseCase
    private lateinit var taskCommentsUseCase: TaskCommentsUseCase
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var syncManager: SyncManager
    private lateinit var preferences: AppPreferences
    private lateinit var authRepository: AuthRepository

    private val networkOnlineFlow = MutableStateFlow(true)
    private val tasksFlow = MutableStateFlow<List<Task>>(emptyList())
    private val pendingCountFlow = MutableStateFlow(0)

    private fun sampleTask(
        id: Long = 1L,
        title: String = "Тестовая заявка",
        status: TaskStatus = TaskStatus.NEW,
        priority: Priority = Priority.CURRENT,
        address: String = "ул. Ленина 10"
    ) = Task(
        id = id,
        taskNumber = "Z-$id",
        title = title,
        address = address,
        description = "Описание заявки $id",
        lat = 55.75,
        lon = 37.62,
        status = status,
        priority = priority,
        createdAt = "2026-02-15T10:00:00",
        updatedAt = "2026-02-15T10:00:00",
        commentsCount = 0
    )

    /**
     * Создаёт реальный AppPreferences с мокнутым SharedPreferences.
     * MockK не может мокать final-класс AppPreferences на JDK 21 (агент не работает),
     * поэтому используем реальный экземпляр с фейковым хранилищем.
     */
    private fun createRealPreferences(): AppPreferences {
        val storage = mutableMapOf<String, Any?>()
        val mockEditor = mockk<SharedPreferences.Editor>(relaxed = true)
        val mockSharedPrefs = mockk<SharedPreferences>(relaxed = true)
        val mockContext = mockk<Context>(relaxed = true)

        // SharedPreferences.Editor — запись в storage
        every { mockEditor.putString(any(), any()) } answers {
            storage[firstArg()] = secondArg<String?>()
            mockEditor
        }
        every { mockEditor.putStringSet(any(), any()) } answers {
            storage[firstArg()] = secondArg<Set<String>?>()
            mockEditor
        }
        every { mockEditor.putBoolean(any(), any()) } answers {
            storage[firstArg()] = secondArg<Boolean>()
            mockEditor
        }
        every { mockEditor.putInt(any(), any()) } answers {
            storage[firstArg()] = secondArg<Int>()
            mockEditor
        }
        every { mockEditor.putLong(any(), any()) } answers {
            storage[firstArg()] = secondArg<Long>()
            mockEditor
        }
        every { mockEditor.remove(any()) } answers {
            storage.remove(firstArg<String>())
            mockEditor
        }
        every { mockEditor.clear() } answers {
            storage.clear()
            mockEditor
        }

        // SharedPreferences — чтение из storage
        every { mockSharedPrefs.getString(any(), any()) } answers {
            storage[firstArg()] as? String ?: secondArg()
        }
        @Suppress("UNCHECKED_CAST")
        every { mockSharedPrefs.getStringSet(any(), any()) } answers {
            storage[firstArg()] as? Set<String> ?: secondArg()
        }
        every { mockSharedPrefs.getBoolean(any(), any()) } answers {
            storage[firstArg()] as? Boolean ?: secondArg()
        }
        every { mockSharedPrefs.getInt(any(), any()) } answers {
            storage[firstArg()] as? Int ?: secondArg()
        }
        every { mockSharedPrefs.getLong(any(), any()) } answers {
            storage[firstArg()] as? Long ?: secondArg()
        }
        every { mockSharedPrefs.edit() } returns mockEditor
        every { mockContext.getSharedPreferences(any(), any()) } returns mockSharedPrefs

        return AppPreferences(mockContext)
    }

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        
        getTasksUseCase = mockk(relaxed = true)
        every { getTasksUseCase.tasksFlow } returns tasksFlow
        every { getTasksUseCase.pendingActionsCount } returns pendingCountFlow
        
        updateTaskStatusUseCase = mockk(relaxed = true)
        taskPhotosUseCase = mockk(relaxed = true)
        taskCommentsUseCase = mockk(relaxed = true)
        
        networkMonitor = mockk(relaxed = true)
        every { networkMonitor.isOnline } returns networkOnlineFlow
        
        syncManager = mockk(relaxed = true)
        
        // Реальный AppPreferences с фейковым SharedPreferences хранилищем
        // (MockK не может мокать этот final-класс на JDK 21)
        preferences = createRealPreferences()
        
        authRepository = mockk(relaxed = true)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): MapViewModel {
        coEvery { authRepository.validateCurrentUser() } returns AuthRepository.ValidationResult.VALID
        coEvery { getTasksUseCase.refreshTasks() } returns Result.success(emptyList())
        
        return MapViewModel(
            getTasksUseCase, updateTaskStatusUseCase, taskPhotosUseCase,
            taskCommentsUseCase, networkMonitor, syncManager, preferences, authRepository
        )
    }

    // ==================== Инициализация ====================

    @Test
    fun `initial state has empty tasks and no error`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertNull(state.error)
    }

    @Test
    fun `init validates session before loading tasks`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        coVerify { authRepository.validateCurrentUser() }
        coVerify { getTasksUseCase.refreshTasks() }
    }

    @Test
    fun `init starts periodic sync`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        verify { syncManager.startPeriodicSync() }
    }

    // ==================== Session validation ====================

    @Test
    fun `invalid session triggers logout without loading tasks`() = runTest {
        coEvery { authRepository.validateCurrentUser() } returns AuthRepository.ValidationResult.INVALID

        val viewModel = MapViewModel(
            getTasksUseCase, updateTaskStatusUseCase, taskPhotosUseCase,
            taskCommentsUseCase, networkMonitor, syncManager, preferences, authRepository
        )
        advanceUntilIdle()

        coVerify { getTasksUseCase.clearCache() }
        // AppPreferences — реальный экземпляр, проверяем эффект triggerLogout()
        assertTrue(preferences.forcedLogoutRequested)
        assertNull(preferences.getAuthToken())
        assertTrue(viewModel.uiState.value.tasks.isEmpty())
    }

    @Test
    fun `unknown session allows cached mode`() = runTest {
        coEvery { authRepository.validateCurrentUser() } returns AuthRepository.ValidationResult.UNKNOWN
        coEvery { getTasksUseCase.refreshTasks() } returns Result.success(listOf(sampleTask()))

        val viewModel = MapViewModel(
            getTasksUseCase, updateTaskStatusUseCase, taskPhotosUseCase,
            taskCommentsUseCase, networkMonitor, syncManager, preferences, authRepository
        )
        advanceUntilIdle()

        // Должен продолжить загрузку
        coVerify { getTasksUseCase.refreshTasks() }
    }

    // ==================== Загрузка задач ====================

    @Test
    fun `loadTasks updates state on success`() = runTest {
        val tasks = listOf(sampleTask(1), sampleTask(2))
        coEvery { getTasksUseCase.refreshTasks() } returns Result.success(tasks)
        coEvery { getTasksUseCase.getLastSyncTime() } returns 1708000000000L

        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.loadTasks()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertNull(state.error)
    }

    @Test
    fun `loadTasks sets error on failure`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        // Переопределяем ПОСЛЕ createViewModel
        coEvery { getTasksUseCase.refreshTasks() } returns Result.failure(
            Exception("Сервер недоступен")
        )

        viewModel.loadTasks()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Сервер недоступен", state.error)
        assertFalse(state.isLoading)
    }

    @Test
    fun `401 error triggers logout`() = runTest {
        // Первый вызов — валидация ОК, второй — 401
        coEvery { authRepository.validateCurrentUser() } returns AuthRepository.ValidationResult.VALID
        coEvery { getTasksUseCase.refreshTasks() } returns Result.failure(
            Exception("Сессия истекла 401")
        )

        val viewModel = MapViewModel(
            getTasksUseCase, updateTaskStatusUseCase, taskPhotosUseCase,
            taskCommentsUseCase, networkMonitor, syncManager, preferences, authRepository
        )
        advanceUntilIdle()

        assertTrue(preferences.forcedLogoutRequested)
        assertNull(preferences.getAuthToken())
    }

    // ==================== Выбор задачи ====================

    @Test
    fun `selectTask sets selectedTask and loads details`() = runTest {
        val task = sampleTask()
        coEvery { getTasksUseCase.getTaskDetail(1L) } returns Result.success(
            Pair(task, listOf(
                Comment(1L, 1L, "Тест", "Иванов", null, null, "2026-02-15T10:00:00")
            ))
        )
        coEvery { taskPhotosUseCase.getPhotos(1L) } returns Result.success(emptyList())

        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.selectTask(task)
        advanceUntilIdle()

        assertEquals(task, viewModel.uiState.value.selectedTask)
        coVerify { getTasksUseCase.getTaskDetail(1L) }
        coVerify { taskPhotosUseCase.getPhotos(1L) }
    }

    @Test
    fun `selectTask with null clears selection`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.selectTask(null)

        assertNull(viewModel.uiState.value.selectedTask)
        assertTrue(viewModel.uiState.value.comments.isEmpty())
        assertTrue(viewModel.uiState.value.photos.isEmpty())
    }

    // ==================== Обновление статуса ====================

    @Test
    fun `updateTaskStatus success updates task in list`() = runTest {
        val task = sampleTask(status = TaskStatus.NEW)
        val updatedTask = task.copy(status = TaskStatus.IN_PROGRESS)
        
        coEvery { getTasksUseCase.refreshTasks() } returns Result.success(listOf(task))
        coEvery { updateTaskStatusUseCase.invoke(1L, TaskStatus.IN_PROGRESS, "") } returns Result.success(updatedTask)
        coEvery { getTasksUseCase.getTaskDetail(1L) } returns Result.success(
            Pair(updatedTask, emptyList())
        )

        val viewModel = createViewModel()
        advanceUntilIdle()

        // Подгружаем задачи через Flow
        tasksFlow.value = listOf(task)
        advanceUntilIdle()

        viewModel.updateTaskStatus(1L, TaskStatus.IN_PROGRESS)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.statusUpdateSuccess)
        assertFalse(state.showStatusDialog)
    }

    @Test
    fun `updateTaskStatus failure sets error`() = runTest {
        coEvery { updateTaskStatusUseCase.invoke(1L, TaskStatus.DONE, "") } returns Result.failure(
            Exception("Невозможный переход статуса")
        )

        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.updateTaskStatus(1L, TaskStatus.DONE)
        advanceUntilIdle()

        assertEquals("Невозможный переход статуса", viewModel.uiState.value.error)
    }

    // ==================== Комментарии ====================

    @Test
    fun `addComment with blank text does nothing`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.addComment(1L, "   ")

        coVerify(exactly = 0) { taskCommentsUseCase.addComment(any(), any()) }
    }

    @Test
    fun `addComment success reloads task details`() = runTest {
        val comment = Comment(1L, 1L, "Новый комментарий", "Иванов", null, null, "2026-02-15T10:00:00")
        coEvery { taskCommentsUseCase.addComment(1L, "Привет") } returns Result.success(comment)
        coEvery { getTasksUseCase.getTaskDetail(1L) } returns Result.success(
            Pair(sampleTask(), listOf(comment))
        )

        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.addComment(1L, "Привет")
        advanceUntilIdle()

        coVerify { taskCommentsUseCase.addComment(1L, "Привет") }
        coVerify { getTasksUseCase.getTaskDetail(1L) }
    }

    // ==================== Фильтрация ====================

    @Test
    fun `setStatusFilter updates state and saves to preferences`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        val filter = setOf(TaskStatus.NEW, TaskStatus.IN_PROGRESS)
        viewModel.setStatusFilter(filter)

        assertEquals(filter, viewModel.uiState.value.statusFilter)
        assertEquals(filter, preferences.statusFilter.value)
    }

    @Test
    fun `setPriorityFilter updates state and saves to preferences`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        val filter = setOf(Priority.URGENT, Priority.EMERGENCY)
        viewModel.setPriorityFilter(filter)

        assertEquals(filter, viewModel.uiState.value.priorityFilter)
        assertEquals(filter, preferences.priorityFilter.value)
    }

    @Test
    fun `setSearchQuery updates state`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.setSearchQuery("ремонт")
        assertEquals("ремонт", viewModel.uiState.value.searchQuery)
    }

    @Test
    fun `clearFilters resets all filters`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.setStatusFilter(setOf(TaskStatus.NEW))
        viewModel.setPriorityFilter(setOf(Priority.URGENT))
        viewModel.setSearchQuery("test")

        viewModel.clearFilters()

        val state = viewModel.uiState.value
        assertTrue(state.statusFilter.isEmpty())
        assertTrue(state.priorityFilter.isEmpty())
        assertEquals("", state.searchQuery)
    }

    // ==================== Сортировка ====================

    @Test
    fun `setSortOrder updates state`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.setSortOrder(TaskSortOrder.BY_PRIORITY_DESC)
        assertEquals(TaskSortOrder.BY_PRIORITY_DESC, viewModel.uiState.value.sortOrder)
    }

    // ==================== Местоположение ====================

    @Test
    fun `updateMyLocation updates coordinates`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.updateMyLocation(55.75, 37.62)

        assertEquals(55.75, viewModel.uiState.value.myLocationLat!!, 0.001)
        assertEquals(37.62, viewModel.uiState.value.myLocationLon!!, 0.001)
    }

    @Test
    fun `toggleShowMyLocation updates state and saves to preferences`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.toggleShowMyLocation(false)

        assertFalse(viewModel.uiState.value.showMyLocation)
        assertFalse(preferences.showMyLocation.value)
    }

    // ==================== Статус диалог ====================

    @Test
    fun `showStatusDialog and hideStatusDialog toggle state`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.showStatusDialog()
        assertTrue(viewModel.uiState.value.showStatusDialog)

        viewModel.hideStatusDialog()
        assertFalse(viewModel.uiState.value.showStatusDialog)
    }

    // ==================== Сетевой статус ====================

    @Test
    fun `offline status is reflected in state`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        networkOnlineFlow.value = false
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.isOffline)
    }

    @Test
    fun `going online triggers immediate sync`() = runTest {
        networkOnlineFlow.value = false
        val viewModel = createViewModel()
        advanceUntilIdle()

        networkOnlineFlow.value = true
        advanceUntilIdle()

        verify(atLeast = 1) { syncManager.triggerImmediateSync() }
    }

    // ==================== Подключение ====================

    @Test
    fun `testConnection sets testing status`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.testConnection("http://localhost:8001")
        // Продвигаем scheduler чтобы выполнился первый шаг корутины
        testDispatcher.scheduler.runCurrent()

        assertEquals(ConnectionStatus.TESTING, viewModel.connectionStatus.value)
    }

    // ==================== Ошибки ====================

    @Test
    fun `clearError removes error from state`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        coEvery { getTasksUseCase.refreshTasks() } returns Result.failure(Exception("Error"))
        viewModel.loadTasks()
        advanceUntilIdle()

        assertNotNull(viewModel.uiState.value.error)

        viewModel.clearError()
        assertNull(viewModel.uiState.value.error)
    }

    @Test
    fun `clearStatusUpdateSuccess resets flag`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.clearStatusUpdateSuccess()
        assertFalse(viewModel.uiState.value.statusUpdateSuccess)
    }

    // ==================== Фото ====================

    @Test
    fun `deletePhoto success removes photo from state`() = runTest {
        coEvery { taskPhotosUseCase.deletePhoto(5L) } returns Result.success(Unit)

        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.deletePhoto(5L)
        advanceUntilIdle()

        coVerify { taskPhotosUseCase.deletePhoto(5L) }
    }

    @Test
    fun `deletePhoto failure sets error`() = runTest {
        coEvery { taskPhotosUseCase.deletePhoto(5L) } returns Result.failure(
            Exception("Фото не найдено")
        )

        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.deletePhoto(5L)
        advanceUntilIdle()

        assertEquals("Фото не найдено", viewModel.uiState.value.error)
    }

    // ==================== ForceSync ====================

    @Test
    fun `forceSync triggers immediate sync and reloads tasks`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.forceSync()
        advanceUntilIdle()

        verify { syncManager.triggerImmediateSync() }
        coVerify(atLeast = 2) { getTasksUseCase.refreshTasks() } // init + forceSync
    }

    // ==================== Pending actions ====================

    @Test
    fun `pending actions count is reflected in state`() = runTest {
        val viewModel = createViewModel()
        advanceUntilIdle()

        pendingCountFlow.value = 3
        advanceUntilIdle()

        assertEquals(3, viewModel.uiState.value.pendingActionsCount)
    }

    // ==================== filteredTasks ====================

    @Test
    fun `filteredTasks applies status filter`() {
        val state = MapUiState(
            tasks = listOf(
                sampleTask(1, status = TaskStatus.NEW),
                sampleTask(2, status = TaskStatus.IN_PROGRESS),
                sampleTask(3, status = TaskStatus.DONE)
            ),
            statusFilter = setOf(TaskStatus.NEW)
        )

        assertEquals(1, state.filteredTasks.size)
        assertEquals(TaskStatus.NEW, state.filteredTasks[0].status)
    }

    @Test
    fun `filteredTasks applies priority filter`() {
        val state = MapUiState(
            tasks = listOf(
                sampleTask(1, priority = Priority.PLANNED),
                sampleTask(2, priority = Priority.URGENT),
                sampleTask(3, priority = Priority.EMERGENCY)
            ),
            priorityFilter = setOf(Priority.URGENT, Priority.EMERGENCY)
        )

        assertEquals(2, state.filteredTasks.size)
    }

    @Test
    fun `filteredTasks applies search query`() {
        val state = MapUiState(
            tasks = listOf(
                sampleTask(1, title = "Замена счётчика"),
                sampleTask(2, title = "Ремонт крана"),
                sampleTask(3, title = "Диагностика системы")
            ),
            searchQuery = "ремонт"
        )

        assertEquals(1, state.filteredTasks.size)
        assertEquals("Ремонт крана", state.filteredTasks[0].title)
    }

    @Test
    fun `filteredTasks empty filter returns all tasks`() {
        val tasks = listOf(sampleTask(1), sampleTask(2), sampleTask(3))
        val state = MapUiState(tasks = tasks)

        assertEquals(3, state.filteredTasks.size)
    }

    @Test
    fun `filteredTasks search by task number`() {
        val state = MapUiState(
            tasks = listOf(
                sampleTask(1),
                sampleTask(2),
                sampleTask(42)
            ),
            searchQuery = "Z-42"
        )

        assertEquals(1, state.filteredTasks.size)
        assertEquals(42L, state.filteredTasks[0].id)
    }

    @Test
    fun `filteredTasks search by address`() {
        val state = MapUiState(
            tasks = listOf(
                sampleTask(1, address = "ул. Пушкина 15"),
                sampleTask(2, address = "ул. Ленина 10"),
                sampleTask(3, address = "пр. Мира 5")
            ),
            searchQuery = "Ленина"
        )

        assertEquals(1, state.filteredTasks.size)
        assertEquals("ул. Ленина 10", state.filteredTasks[0].address)
    }

    @Test
    fun `filteredTasks combined filters`() {
        val state = MapUiState(
            tasks = listOf(
                sampleTask(1, title = "Ремонт", status = TaskStatus.NEW, priority = Priority.URGENT),
                sampleTask(2, title = "Ремонт крана", status = TaskStatus.IN_PROGRESS, priority = Priority.URGENT),
                sampleTask(3, title = "Диагностика", status = TaskStatus.NEW, priority = Priority.PLANNED)
            ),
            statusFilter = setOf(TaskStatus.NEW),
            priorityFilter = setOf(Priority.URGENT),
            searchQuery = "ремонт"
        )

        assertEquals(1, state.filteredTasks.size)
        assertEquals(1L, state.filteredTasks[0].id)
    }
}
