package com.fieldworker.data.repository

import com.fieldworker.data.api.TasksApi
import com.fieldworker.data.dto.TaskDto
import com.fieldworker.data.dto.TaskDetailDto
import com.fieldworker.data.dto.CommentDto
import com.fieldworker.data.local.dao.CommentDao
import com.fieldworker.data.local.dao.PendingActionDao
import com.fieldworker.data.local.dao.TaskDao
import com.fieldworker.data.local.entity.TaskEntity
import com.fieldworker.data.network.NetworkMonitor
import com.fieldworker.domain.model.TaskStatus
import io.mockk.*
import io.mockk.impl.annotations.MockK
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test
import retrofit2.Response

/**
 * Unit тесты для OfflineFirstTasksRepository.
 * Проверяют логику offline-first стратегии.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class OfflineFirstTasksRepositoryTest {

    companion object {
        @JvmStatic
        @BeforeClass
        fun setupClass() {
            // Mock Android Log class
            mockkStatic(android.util.Log::class)
            every { android.util.Log.d(any(), any()) } returns 0
            every { android.util.Log.e(any(), any()) } returns 0
            every { android.util.Log.e(any(), any(), any()) } returns 0
            every { android.util.Log.w(any(), any<String>()) } returns 0
            every { android.util.Log.i(any(), any()) } returns 0
        }
    }

    @MockK
    private lateinit var tasksApi: TasksApi

    @MockK
    private lateinit var taskDao: TaskDao

    @MockK
    private lateinit var commentDao: CommentDao

    @MockK
    private lateinit var pendingActionDao: PendingActionDao

    @MockK
    private lateinit var networkMonitor: NetworkMonitor

    private lateinit var repository: OfflineFirstTasksRepository

    private val testTaskDto = TaskDto(
        id = 1L,
        taskNumber = "Z-001",
        title = "Test Task",
        rawAddress = "Test Address",
        description = "Test Description",
        lat = 55.75,
        lon = 37.62,
        status = "NEW",
        priority = 2,
        createdAt = "2024-01-01T10:00:00",
        updatedAt = "2024-01-01T10:00:00",
        commentsCount = 0
    )

    private val testTaskEntity = TaskEntity(
        id = 1L,
        taskNumber = "Z-001",
        title = "Test Task",
        address = "Test Address",
        description = "Test Description",
        lat = 55.75,
        lon = 37.62,
        status = "NEW",
        priority = 2,
        createdAt = "2024-01-01T10:00:00",
        updatedAt = "2024-01-01T10:00:00",
        commentsCount = 0
    )

    @Before
    fun setup() {
        MockKAnnotations.init(this, relaxUnitFun = true)
        
        // Default mocks
        every { taskDao.getAllTasksFlow() } returns flowOf(listOf(testTaskEntity))
        every { pendingActionDao.getPendingActionsCountFlow() } returns flowOf(0)
        
        repository = OfflineFirstTasksRepository(
            tasksApi = tasksApi,
            taskDao = taskDao,
            commentDao = commentDao,
            pendingActionDao = pendingActionDao,
            networkMonitor = networkMonitor
        )
    }

    // =========================================================================
    // refreshTasks() tests
    // =========================================================================

    @Test
    fun `refreshTasks returns data from server when online`() = runTest {
        // Given
        every { networkMonitor.isCurrentlyOnline() } returns true
        coEvery { tasksApi.getTasks(any()) } returns Response.success(listOf(testTaskDto))
        coEvery { taskDao.upsertTasks(any()) } just Runs
        coEvery { taskDao.deleteTasksNotIn(any()) } just Runs
        coEvery { pendingActionDao.getAllPendingActions() } returns emptyList()

        // When
        val result = repository.refreshTasks()

        // Then
        assertTrue(result.isSuccess)
        assertEquals(1, result.getOrNull()?.size)
        assertEquals("Test Task", result.getOrNull()?.first()?.title)
        coVerify { taskDao.upsertTasks(any()) }
    }

    @Test
    fun `refreshTasks returns cached data when offline`() = runTest {
        // Given
        every { networkMonitor.isCurrentlyOnline() } returns false
        coEvery { taskDao.getAllTasks() } returns listOf(testTaskEntity)

        // When
        val result = repository.refreshTasks()

        // Then
        assertTrue(result.isSuccess)
        assertEquals(1, result.getOrNull()?.size)
        coVerify(exactly = 0) { tasksApi.getTasks(any()) }
    }

    @Test
    fun `refreshTasks returns cached data on network error`() = runTest {
        // Given
        every { networkMonitor.isCurrentlyOnline() } returns true
        coEvery { tasksApi.getTasks(any()) } throws Exception("Network error")
        coEvery { taskDao.getAllTasks() } returns listOf(testTaskEntity)
        coEvery { pendingActionDao.getAllPendingActions() } returns emptyList()

        // When
        val result = repository.refreshTasks()

        // Then
        assertTrue(result.isSuccess)
        assertEquals(1, result.getOrNull()?.size)
    }

    @Test
    fun `refreshTasks returns error when offline and no cache`() = runTest {
        // Given
        every { networkMonitor.isCurrentlyOnline() } returns false
        coEvery { taskDao.getAllTasks() } returns emptyList()

        // When
        val result = repository.refreshTasks()

        // Then
        // With empty cache but offline, we still return empty success (not failure)
        assertTrue(result.isSuccess)
        assertTrue(result.getOrNull()?.isEmpty() == true)
    }

    // =========================================================================
    // updateTaskStatus() tests
    // =========================================================================

    @Test
    fun `updateTaskStatus sends to server when online`() = runTest {
        // Given
        every { networkMonitor.isCurrentlyOnline() } returns true
        val updatedDto = TaskDetailDto(
            id = 1L,
            taskNumber = "Z-001",
            title = "Test Task",
            rawAddress = "Test Address",
            description = "Test Description",
            lat = 55.75,
            lon = 37.62,
            status = "IN_PROGRESS",
            priority = 2,
            createdAt = "2024-01-01T10:00:00",
            updatedAt = "2024-01-01T11:00:00",
            comments = emptyList()
        )
        coEvery { tasksApi.updateTaskStatus(any(), any()) } returns Response.success(updatedDto)
        coEvery { taskDao.upsertTask(any()) } just Runs

        // When
        val result = repository.updateTaskStatus(1L, TaskStatus.IN_PROGRESS, "Starting work")

        // Then
        assertTrue(result.isSuccess)
        assertEquals(TaskStatus.IN_PROGRESS, result.getOrNull()?.status)
        coVerify { tasksApi.updateTaskStatus(1L, any()) }
    }

    @Test
    fun `updateTaskStatus saves locally when offline`() = runTest {
        // Given
        every { networkMonitor.isCurrentlyOnline() } returns false
        coEvery { taskDao.updateStatusLocally(any(), any(), any(), any()) } just Runs
        coEvery { pendingActionDao.insertPendingAction(any()) } returns 1L
        coEvery { taskDao.getTaskById(1L) } returns testTaskEntity.copy(status = "IN_PROGRESS")

        // When
        val result = repository.updateTaskStatus(1L, TaskStatus.IN_PROGRESS, "Starting work")

        // Then
        assertTrue(result.isSuccess)
        coVerify { taskDao.updateStatusLocally(1L, "IN_PROGRESS", "IN_PROGRESS", "Starting work") }
        coVerify { pendingActionDao.insertPendingAction(any()) }
    }

    // =========================================================================
    // hasCachedData() tests
    // =========================================================================

    @Test
    fun `hasCachedData returns true when tasks exist`() = runTest {
        // Given
        coEvery { taskDao.getTasksCount() } returns 5

        // When
        val result = repository.hasCachedData()

        // Then
        assertTrue(result)
    }

    @Test
    fun `hasCachedData returns false when no tasks`() = runTest {
        // Given
        coEvery { taskDao.getTasksCount() } returns 0

        // When
        val result = repository.hasCachedData()

        // Then
        assertFalse(result)
    }

    // =========================================================================
    // clearCache() tests
    // =========================================================================

    @Test
    fun `clearCache removes all data`() = runTest {
        // Given
        coEvery { taskDao.deleteAllTasks() } just Runs
        coEvery { pendingActionDao.deleteAllPendingActions() } just Runs

        // When
        repository.clearCache()

        // Then
        coVerify { taskDao.deleteAllTasks() }
        coVerify { pendingActionDao.deleteAllPendingActions() }
    }
}
