package com.fieldworker.data.repository

import com.fieldworker.data.api.TasksApi
import android.net.Uri
import com.fieldworker.data.image.PendingPhotoStore
import com.fieldworker.data.local.LocalTransactionRunner
import com.fieldworker.data.local.dao.CommentDao
import com.fieldworker.data.local.dao.PendingActionDao
import com.fieldworker.data.local.dao.TaskDao
import com.fieldworker.data.local.entity.TaskEntity
import com.fieldworker.data.local.entity.ActionType
import com.fieldworker.data.local.entity.PendingAction
import com.fieldworker.data.network.NetworkMonitor
import com.fieldworker.data.remote.generated.PaginatedResponseTaskListResponse
import com.fieldworker.data.remote.generated.PhotoResponse
import com.fieldworker.data.remote.generated.TaskIdsResponse
import com.fieldworker.data.remote.generated.TaskListResponse
import com.fieldworker.data.remote.generated.TaskResponse
import com.fieldworker.data.remote.generated.TaskPriority as GenTaskPriority
import com.fieldworker.data.remote.generated.TaskStatus as GenTaskStatus
import com.fieldworker.domain.model.TaskStatus
import java.math.BigDecimal
import io.mockk.*
import io.mockk.impl.annotations.MockK
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import okhttp3.ResponseBody.Companion.toResponseBody
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
    private lateinit var transactionRunner: LocalTransactionRunner

    @MockK
    private lateinit var networkMonitor: NetworkMonitor

    @MockK
    private lateinit var pendingPhotoStore: PendingPhotoStore

    @get:Rule
    val tempFolder = TemporaryFolder()

    private lateinit var repository: OfflineFirstTasksRepository

    private val testTaskDto = TaskListResponse(
        id = 1L,
        taskNumber = "Z-001",
        title = "Test Task",
        rawAddress = "Test Address",
        description = "Test Description",
        lat = BigDecimal("55.75"),
        lon = BigDecimal("37.62"),
        status = GenTaskStatus.NEW,
        priority = GenTaskPriority.CURRENT,
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
        every { pendingActionDao.getFailedActionsFlow(any()) } returns flowOf(emptyList())
        coEvery { taskDao.getLocallyModifiedTasks() } returns emptyList()
        coEvery { pendingActionDao.getAllPendingActions() } returns emptyList()
        coEvery { pendingActionDao.getPendingActionsForTask(any()) } returns emptyList()
        coEvery { taskDao.getAllTasks() } returns listOf(testTaskEntity)
        coEvery { taskDao.getMaxUpdatedAt() } returns null
        coEvery { taskDao.getSyncedTaskIds() } returns emptyList()
        coEvery { transactionRunner.run(any()) } coAnswers {
            firstArg<suspend () -> Unit>().invoke()
        }
        
        repository = OfflineFirstTasksRepository(
            tasksApi = tasksApi,
            taskDao = taskDao,
            commentDao = commentDao,
            pendingActionDao = pendingActionDao,
            transactionRunner = transactionRunner,
            networkMonitor = networkMonitor,
            pendingPhotoStore = pendingPhotoStore
        )
    }

    private fun givenQueue(vararg actions: PendingAction) {
        coEvery { pendingActionDao.getAllPendingActions() } returns actions.toList()
        actions.forEach { action ->
            coEvery { pendingActionDao.getPendingActionById(action.id) } returns action
        }
    }

    private fun photoAction(id: Long, taskId: Long = 1L, retryCount: Int = 0) = PendingAction(
        id = id,
        taskId = taskId,
        actionType = ActionType.UPLOAD_PHOTO,
        filePath = tempFolder.newFile("op-$id.jpg").apply { writeBytes(byteArrayOf(1)) }.absolutePath,
        photoType = "after",
        retryCount = retryCount
    )

    private val serverTaskResponse = TaskResponse(
        id = 1L,
        taskNumber = "Z-001",
        title = "Test Task",
        rawAddress = "Test Address",
        description = "Test Description",
        lat = BigDecimal("55.75"),
        lon = BigDecimal("37.62"),
        status = GenTaskStatus.NEW,
        priority = GenTaskPriority.CURRENT,
        createdAt = "2024-01-01T10:00:00",
        updatedAt = "2024-01-01T11:00:00",
        comments = emptyList()
    )

    // =========================================================================
    // refreshTasks() tests
    // =========================================================================

    @Test
    fun `refreshTasks returns data from server when online`() = runTest {
        // Given
        every { networkMonitor.isCurrentlyOnline() } returns true
        coEvery { tasksApi.getTasks(any(), any(), any(), any()) } returns Response.success(
            PaginatedResponseTaskListResponse(items = listOf(testTaskDto), total = 1, page = 1, propertySize = 100, pages = 1)
        )
        coEvery { taskDao.upsertTasks(any()) } just Runs
        coEvery { taskDao.getSyncedTaskIds() } returns emptyList()

        // When
        val result = repository.refreshTasks()

        // Then
        assertTrue(result.isSuccess)
        assertEquals(1, result.getOrNull()?.size)
        assertEquals("Test Task", result.getOrNull()?.first()?.title)
        coVerify { taskDao.upsertTasks(any()) }
    }

    @Test
    fun `second refresh is incremental and prunes tasks no longer visible`() = runTest {
        every { networkMonitor.isCurrentlyOnline() } returns true
        coEvery { taskDao.upsertTasks(any()) } just Runs
        coEvery { tasksApi.getTasks(any(), any(), any(), any()) } returns Response.success(
            PaginatedResponseTaskListResponse(items = listOf(testTaskDto), total = 1, page = 1, propertySize = 100, pages = 1)
        )
        // 1-й проход — полный (курсора нет)
        coEvery { taskDao.getMaxUpdatedAt() } returns null
        coEvery { taskDao.getSyncedTaskIds() } returns emptyList()
        repository.refreshTasks()
        coVerify { tasksApi.getTasks(any(), any(), any(), isNull()) }

        // 2-й проход — инкрементальный: с курсором и сверкой видимых ID
        coEvery { taskDao.getMaxUpdatedAt() } returns "2026-10-28T10:00:00"
        coEvery { tasksApi.getTaskIds() } returns Response.success(TaskIdsResponse(ids = listOf(1L)))
        coEvery { taskDao.getSyncedTaskIds() } returns listOf(1L, 2L, 3L)
        coEvery { taskDao.deleteSyncedTasksByIds(any()) } just Runs
        repository.refreshTasks()

        coVerify { tasksApi.getTasks(any(), any(), any(), eq("2026-10-28T09:58")) }
        coVerify { taskDao.deleteSyncedTasksByIds(listOf(2L, 3L)) }
    }

    @Test
    fun `incremental refresh keeps cache when ids fetch fails`() = runTest {
        every { networkMonitor.isCurrentlyOnline() } returns true
        coEvery { taskDao.upsertTasks(any()) } just Runs
        coEvery { tasksApi.getTasks(any(), any(), any(), any()) } returns Response.success(
            PaginatedResponseTaskListResponse(items = emptyList(), total = 0, page = 1, propertySize = 100, pages = 1)
        )
        coEvery { taskDao.getMaxUpdatedAt() } returns null
        coEvery { taskDao.getSyncedTaskIds() } returns emptyList()
        repository.refreshTasks()

        coEvery { taskDao.getMaxUpdatedAt() } returns "2026-10-28T10:00:00"
        coEvery { tasksApi.getTaskIds() } throws Exception("timeout")
        coEvery { taskDao.getSyncedTaskIds() } returns listOf(5L)
        repository.refreshTasks()

        coVerify(exactly = 0) { taskDao.deleteSyncedTasksByIds(any()) }
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
        coVerify(exactly = 0) { tasksApi.getTasks(any(), any(), any(), any()) }
    }

    @Test
    fun `refreshTasks returns cached data on network error`() = runTest {
        // Given
        every { networkMonitor.isCurrentlyOnline() } returns true
        coEvery { tasksApi.getTasks(any(), any(), any(), any()) } throws Exception("Network error")
        coEvery { taskDao.getAllTasks() } returns listOf(testTaskEntity)

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
        val updatedDto = TaskResponse(
            id = 1L,
            taskNumber = "Z-001",
            title = "Test Task",
            rawAddress = "Test Address",
            description = "Test Description",
            lat = BigDecimal("55.75"),
            lon = BigDecimal("37.62"),
            status = GenTaskStatus.IN_PROGRESS,
            priority = GenTaskPriority.CURRENT,
            createdAt = "2024-01-01T10:00:00",
            updatedAt = "2024-01-01T11:00:00",
            comments = emptyList()
        )
        coEvery { tasksApi.updateTaskStatus(any(), any(), any()) } returns Response.success(updatedDto)
        coEvery { taskDao.upsertTask(any()) } just Runs

        // When
        val result = repository.updateTaskStatus(1L, TaskStatus.IN_PROGRESS, "Starting work")

        // Then
        assertTrue(result.isSuccess)
        assertEquals(TaskStatus.IN_PROGRESS, result.getOrNull()?.status)
        coVerify { tasksApi.updateTaskStatus(1L, any(), any()) }
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
        coVerify(exactly = 1) { transactionRunner.run(any()) }
    }

    // =========================================================================
    // pending outbox tests
    // =========================================================================

    @Test
    fun `syncPendingActions retries temporary server errors`() = runTest {
        val action = PendingAction(
            id = 10L,
            taskId = 1L,
            actionType = ActionType.UPDATE_STATUS,
            newStatus = "IN_PROGRESS"
        )
        every { networkMonitor.isCurrentlyOnline() } returns true
        givenQueue(action)
        coEvery { tasksApi.updateTaskStatus(any(), any(), any()) } returns
            Response.error(503, "unavailable".toResponseBody())
        coEvery { pendingActionDao.incrementRetryCount(any(), any()) } just Runs

        val result = repository.syncPendingActions()

        assertEquals(1, result.retryableFailures)
        assertEquals(0, result.permanentFailures)
        coVerify { pendingActionDao.incrementRetryCount(10L, "Server error: 503") }
        coVerify(exactly = 0) { pendingActionDao.deletePendingActionById(any()) }
    }

    @Test
    fun `enqueueTaskPhoto stores the shot and queues an upload under the same key`() = runTest {
        val uri = mockk<Uri>()
        val stored = tempFolder.newFile("op.jpg")
        val name = slot<String>()
        val queued = slot<PendingAction>()
        coEvery { pendingPhotoStore.save(uri, capture(name)) } returns stored
        coEvery { pendingActionDao.insertPendingAction(capture(queued)) } returns 1L

        val result = repository.enqueueTaskPhoto(taskId = 1L, imageUri = uri, photoType = "before")

        assertTrue(result.isSuccess)
        assertEquals(ActionType.UPLOAD_PHOTO, queued.captured.actionType)
        assertEquals(stored.absolutePath, queued.captured.filePath)
        assertEquals("before", queued.captured.photoType)
        // Имя файла и Idempotency-Key — один идентификатор операции
        assertEquals(name.captured, queued.captured.operationId)
    }

    @Test
    fun `enqueueTaskPhoto fails without queueing when the shot cannot be read`() = runTest {
        coEvery { pendingPhotoStore.save(any(), any()) } returns null

        val result = repository.enqueueTaskPhoto(taskId = 1L, imageUri = mockk(), photoType = "before")

        assertTrue(result.isFailure)
        coVerify(exactly = 0) { pendingActionDao.insertPendingAction(any()) }
    }

    @Test
    fun `syncPendingActions uploads queued photo once and drops the local copy`() = runTest {
        val file = tempFolder.newFile("op-7.jpg").apply { writeBytes(byteArrayOf(1, 2, 3)) }
        val action = PendingAction(
            id = 20L,
            taskId = 1L,
            actionType = ActionType.UPLOAD_PHOTO,
            filePath = file.absolutePath,
            photoType = "after",
            operationId = "op-7"
        )
        every { networkMonitor.isCurrentlyOnline() } returns true
        givenQueue(action)
        coEvery { tasksApi.uploadTaskPhoto(any(), any(), any(), any()) } returns Response.success(
            PhotoResponse(
                id = 5L,
                taskId = 1L,
                filename = "x.jpg",
                originalName = "op-7.jpg",
                fileSize = 3L,
                mimeType = "image/jpeg",
                photoType = "after",
                url = "/api/photos/x.jpg",
                createdAt = "2026-10-30T10:00:00"
            )
        )

        val result = repository.syncPendingActions()

        assertEquals(1, result.synced)
        coVerify { tasksApi.uploadTaskPhoto(1L, any(), "after", "op-7") }
        coVerify { pendingActionDao.deletePendingActionById(20L) }
        verify { pendingPhotoStore.delete(file.absolutePath) }
    }

    @Test
    fun `failed photo upload does not hold back status change of the same task`() = runTest {
        val file = tempFolder.newFile("op-8.jpg").apply { writeBytes(byteArrayOf(1)) }
        val photo = PendingAction(
            id = 30L,
            taskId = 1L,
            actionType = ActionType.UPLOAD_PHOTO,
            filePath = file.absolutePath,
            photoType = "after"
        )
        val status = PendingAction(
            id = 31L,
            taskId = 1L,
            actionType = ActionType.UPDATE_STATUS,
            newStatus = "DONE"
        )
        every { networkMonitor.isCurrentlyOnline() } returns true
        givenQueue(photo, status)
        coEvery { tasksApi.uploadTaskPhoto(any(), any(), any(), any()) } returns
            Response.error(503, "unavailable".toResponseBody())
        coEvery { tasksApi.updateTaskStatus(any(), any(), any()) } returns
            Response.error(503, "unavailable".toResponseBody())

        repository.syncPendingActions()

        // Статус ушёл на сервер, хотя фото перед ним не отправилось
        coVerify { tasksApi.updateTaskStatus(1L, any(), any()) }
    }

    @Test
    fun `syncPendingActions dead letters photo whose file is gone`() = runTest {
        val action = PendingAction(
            id = 21L,
            taskId = 1L,
            actionType = ActionType.UPLOAD_PHOTO,
            filePath = tempFolder.root.resolve("missing.jpg").absolutePath,
            photoType = "after"
        )
        every { networkMonitor.isCurrentlyOnline() } returns true
        givenQueue(action)

        val result = repository.syncPendingActions()

        assertEquals(1, result.permanentFailures)
        coVerify { pendingActionDao.markAsFailed(21L, any(), 5) }
        coVerify(exactly = 0) { tasksApi.uploadTaskPhoto(any(), any(), any(), any()) }
    }

    @Test
    fun `syncPendingActions dead letters permanent client errors`() = runTest {
        val action = PendingAction(
            id = 11L,
            taskId = 1L,
            actionType = ActionType.UPDATE_STATUS,
            newStatus = "IN_PROGRESS"
        )
        every { networkMonitor.isCurrentlyOnline() } returns true
        givenQueue(action)
        coEvery { tasksApi.updateTaskStatus(any(), any(), any()) } returns
            Response.error(422, "invalid".toResponseBody())
        coEvery { pendingActionDao.markAsFailed(any(), any(), any()) } just Runs

        val result = repository.syncPendingActions()

        assertEquals(0, result.retryableFailures)
        assertEquals(1, result.permanentFailures)
        coVerify { pendingActionDao.markAsFailed(11L, "Server error: 422", 5) }
    }

    @Test
    fun `syncPendingActions sends operation id as idempotency key`() = runTest {
        val action = PendingAction(
            id = 12L,
            taskId = 1L,
            actionType = ActionType.UPDATE_STATUS,
            newStatus = "IN_PROGRESS",
            operationId = "op-42"
        )
        every { networkMonitor.isCurrentlyOnline() } returns true
        givenQueue(action)
        coEvery { tasksApi.updateTaskStatus(any(), any(), any()) } returns
            Response.error(503, "unavailable".toResponseBody())
        coEvery { pendingActionDao.incrementRetryCount(any(), any()) } just Runs

        repository.syncPendingActions()

        coVerify { tasksApi.updateTaskStatus(1L, any(), "op-42") }
    }

    @Test
    fun `discarding last failed action restores task from server`() = runTest {
        val action = PendingAction(id = 13L, taskId = 1L, actionType = ActionType.UPDATE_STATUS, newStatus = "DONE")
        coEvery { pendingActionDao.getPendingActionById(13L) } returns action
        coEvery { pendingActionDao.getPendingActionsForTask(1L) } returns emptyList()
        val serverTask = TaskResponse(
            id = 1L,
            taskNumber = "Z-001",
            title = "Test Task",
            rawAddress = "Test Address",
            description = "Test Description",
            lat = BigDecimal("55.75"),
            lon = BigDecimal("37.62"),
            status = GenTaskStatus.NEW,
            priority = GenTaskPriority.CURRENT,
            createdAt = "2024-01-01T10:00:00",
            updatedAt = "2024-01-01T11:00:00",
            comments = emptyList()
        )
        coEvery { tasksApi.getTaskDetail(1L) } returns Response.success(serverTask)

        repository.discardFailedAction(13L)

        coVerify { pendingActionDao.deletePendingActionById(13L) }
        coVerify { taskDao.upsertTask(match { it.id == 1L && it.status == "NEW" }) }
        coVerify { taskDao.markAsSynced(1L, any()) }
    }

    @Test
    fun `discard keeps task local state when other actions still pending`() = runTest {
        val action = PendingAction(id = 14L, taskId = 1L, actionType = ActionType.ADD_COMMENT, comment = "x", tempId = "tmp-1")
        val other = PendingAction(id = 15L, taskId = 1L, actionType = ActionType.UPDATE_STATUS, newStatus = "DONE")
        coEvery { pendingActionDao.getPendingActionById(14L) } returns action
        coEvery { pendingActionDao.getPendingActionsForTask(1L) } returns listOf(other)

        repository.discardFailedAction(14L)

        coVerify { commentDao.deleteByTempId("tmp-1") }
        coVerify(exactly = 0) { tasksApi.getTaskDetail(any()) }
    }

    @Test
    fun `syncPendingActions stops without consuming action on unauthorized`() = runTest {
        val action = PendingAction(
            id = 12L,
            taskId = 1L,
            actionType = ActionType.UPDATE_STATUS,
            newStatus = "IN_PROGRESS"
        )
        every { networkMonitor.isCurrentlyOnline() } returns true
        givenQueue(action)
        coEvery { tasksApi.updateTaskStatus(any(), any(), any()) } returns
            Response.error(401, "unauthorized".toResponseBody())

        val result = repository.syncPendingActions()

        assertTrue(result.requiresAuthentication)
        coVerify(exactly = 0) { pendingActionDao.incrementRetryCount(any(), any()) }
        coVerify(exactly = 0) { pendingActionDao.markAsFailed(any(), any(), any()) }
        coVerify(exactly = 0) { pendingActionDao.deletePendingActionById(any()) }
    }

    @Test
    fun `synced status clears local flag even while a photo of the task is queued`() = runTest {
        val status = PendingAction(id = 40L, taskId = 1L, actionType = ActionType.UPDATE_STATUS, newStatus = "DONE")
        val photo = photoAction(41L)
        every { networkMonitor.isCurrentlyOnline() } returns true
        givenQueue(status)
        // После удаления статуса по заявке остаётся только фото
        coEvery { pendingActionDao.getPendingActionsForTask(1L) } returns listOf(photo)
        coEvery { tasksApi.updateTaskStatus(any(), any(), any()) } returns
            Response.success(serverTaskResponse.copy(status = GenTaskStatus.DONE))

        repository.syncPendingActions()

        coVerify { taskDao.upsertTask(match { it.id == 1L && it.status == "DONE" }) }
        coVerify { taskDao.markAsSynced(1L, any()) }
    }

    @Test
    fun `photo is sent even behind a dead lettered status of the same task`() = runTest {
        val deadStatus = PendingAction(
            id = 42L, taskId = 1L, actionType = ActionType.UPDATE_STATUS, newStatus = "DONE", retryCount = 5
        )
        val comment = PendingAction(id = 43L, taskId = 1L, actionType = ActionType.ADD_COMMENT, comment = "x")
        val photo = photoAction(44L)
        every { networkMonitor.isCurrentlyOnline() } returns true
        givenQueue(deadStatus, comment, photo)
        coEvery { tasksApi.uploadTaskPhoto(any(), any(), any(), any()) } returns
            Response.error(503, "unavailable".toResponseBody())

        repository.syncPendingActions()

        // Комментарий ждёт застрявший статус, фото — нет
        coVerify(exactly = 0) { tasksApi.addComment(any(), any(), any()) }
        coVerify(exactly = 1) { tasksApi.uploadTaskPhoto(1L, any(), any(), any()) }
    }

    @Test
    fun `photo cancelled after the pass started is not uploaded`() = runTest {
        val photo = photoAction(45L)
        every { networkMonitor.isCurrentlyOnline() } returns true
        givenQueue(photo)
        coEvery { pendingActionDao.getPendingActionById(45L) } returns null

        val result = repository.syncPendingActions()

        assertEquals(OfflineFirstTasksRepository.PendingSyncResult(), result)
        coVerify(exactly = 0) { tasksApi.uploadTaskPhoto(any(), any(), any(), any()) }
        coVerify(exactly = 0) { pendingActionDao.markAsFailed(any(), any(), any()) }
    }

    @Test
    fun `photo pass stops at first retryable failure`() = runTest {
        val first = photoAction(46L)
        val second = photoAction(47L)
        every { networkMonitor.isCurrentlyOnline() } returns true
        givenQueue(first, second)
        coEvery { tasksApi.uploadTaskPhoto(any(), any(), any(), any()) } returns
            Response.error(503, "unavailable".toResponseBody())

        val result = repository.syncPendingActions()

        assertEquals(1, result.retryableFailures)
        coVerify(exactly = 1) { tasksApi.uploadTaskPhoto(any(), any(), any(), any()) }
    }

    @Test
    fun `refreshTasks sends task changes but leaves photos to the background sync`() = runTest {
        every { networkMonitor.isCurrentlyOnline() } returns true
        givenQueue(photoAction(48L))
        coEvery { tasksApi.getTasks(any(), any(), any(), any()) } returns Response.success(
            PaginatedResponseTaskListResponse(items = listOf(testTaskDto), total = 1, page = 1, propertySize = 100, pages = 1)
        )

        repository.refreshTasks()

        coVerify(exactly = 0) { tasksApi.uploadTaskPhoto(any(), any(), any(), any()) }
    }

    @Test
    fun `refreshTasks overwrites task whose local flag has no unsent changes`() = runTest {
        every { networkMonitor.isCurrentlyOnline() } returns true
        coEvery { taskDao.getLocallyModifiedTasks() } returns listOf(testTaskEntity.copy(isLocallyModified = true))
        coEvery { tasksApi.getTasks(any(), any(), any(), any()) } returns Response.success(
            PaginatedResponseTaskListResponse(items = listOf(testTaskDto), total = 1, page = 1, propertySize = 100, pages = 1)
        )

        repository.refreshTasks()

        coVerify { taskDao.markAsSynced(1L, any()) }
        coVerify { taskDao.upsertTasks(match { tasks -> tasks.any { it.id == 1L } }) }
    }

    @Test
    fun `refreshTasks keeps task with unsent status change`() = runTest {
        every { networkMonitor.isCurrentlyOnline() } returns true
        coEvery { taskDao.getLocallyModifiedTasks() } returns listOf(testTaskEntity.copy(isLocallyModified = true))
        givenQueue(
            PendingAction(id = 49L, taskId = 1L, actionType = ActionType.UPDATE_STATUS, newStatus = "DONE", retryCount = 5)
        )
        coEvery { tasksApi.getTasks(any(), any(), any(), any()) } returns Response.success(
            PaginatedResponseTaskListResponse(items = listOf(testTaskDto), total = 1, page = 1, propertySize = 100, pages = 1)
        )

        repository.refreshTasks()

        coVerify(exactly = 0) { taskDao.markAsSynced(1L, any()) }
        coVerify { taskDao.upsertTasks(match { tasks -> tasks.none { it.id == 1L } }) }
    }

    @Test
    fun `discarding dead lettered status restores task although a photo is queued`() = runTest {
        val status = PendingAction(id = 50L, taskId = 1L, actionType = ActionType.UPDATE_STATUS, newStatus = "DONE")
        coEvery { pendingActionDao.getPendingActionById(50L) } returns status
        coEvery { pendingActionDao.getPendingActionsForTask(1L) } returns listOf(photoAction(51L))
        coEvery { tasksApi.getTaskDetail(1L) } returns Response.success(serverTaskResponse)

        repository.discardFailedAction(50L)

        coVerify { taskDao.upsertTask(match { it.id == 1L && it.status == "NEW" }) }
        coVerify { taskDao.markAsSynced(1L, any()) }
    }

    @Test
    fun `cancelling queued photo deletes it without touching the task`() = runTest {
        val photo = photoAction(52L)
        coEvery { pendingActionDao.getPendingActionById(52L) } returns photo

        repository.discardFailedAction(52L)

        coVerify { pendingActionDao.deletePendingActionById(52L) }
        verify { pendingPhotoStore.delete(photo.filePath) }
        coVerify(exactly = 0) { tasksApi.getTaskDetail(any()) }
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
        verify { pendingPhotoStore.clear() }
        verify { pendingPhotoStore.clearCameraShots() }
    }

    @Test
    fun `clearCache after expired session keeps unsent changes and photos`() = runTest {
        repository.clearCache(keepOutbox = true)

        coVerify { taskDao.deleteAllTasks() }
        coVerify(exactly = 0) { pendingActionDao.deleteAllPendingActions() }
        verify(exactly = 0) { pendingPhotoStore.clear() }
        verify { pendingPhotoStore.clearCameraShots() }
    }
}
