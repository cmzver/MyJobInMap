package com.fieldworker.ui.day

import com.fieldworker.data.api.DayRouteRequest
import com.fieldworker.data.api.MyDayResponse
import com.fieldworker.data.api.TasksApi
import com.fieldworker.data.network.NetworkMonitor
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.remote.generated.TaskListResponse
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.domain.usecase.GetTasksUseCase
import com.fieldworker.testutil.FakeSharedPreferences
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response
import java.io.IOException
import java.time.LocalDate

@OptIn(ExperimentalCoroutinesApi::class)
class MyDayViewModelTest {

    private lateinit var dispatcher: TestDispatcher
    private lateinit var api: TasksApi
    private lateinit var preferences: AppPreferences
    private lateinit var useCase: GetTasksUseCase
    private lateinit var networkMonitor: NetworkMonitor
    private val tasksFlow = MutableStateFlow<List<Task>>(emptyList())
    private val online = MutableStateFlow(true)
    private val today = LocalDate.now().toString()

    private fun task(id: Long) = Task(
        id = id,
        taskNumber = "N-$id",
        title = "Заявка $id",
        address = "Адрес $id",
        description = "",
        lat = 59.9,
        lon = 30.3,
        status = TaskStatus.NEW,
        priority = Priority.CURRENT,
        createdAt = "2026-11-01T10:00:00",
        updatedAt = "2026-11-01T10:00:00",
        assignedUserId = ME,
    )

    private fun dayResponse(vararg ids: Long): Response<MyDayResponse> =
        Response.success(MyDayResponse(today, ids.map { id -> mockk<TaskListResponse> { every { this@mockk.id } returns id } }))

    @Before
    fun setup() {
        dispatcher = StandardTestDispatcher()
        Dispatchers.setMain(dispatcher)
        val context = mockk<android.content.Context>(relaxed = true)
        val fakePrefs = FakeSharedPreferences()
        every { context.getSharedPreferences(any(), any()) } returns fakePrefs
        preferences = AppPreferences(context)
        preferences.setUserId(ME)
        api = mockk()
        useCase = mockk(relaxed = true)
        every { useCase.tasksFlow } returns tasksFlow
        coEvery { useCase.refreshTasks() } returns Result.success(emptyList())
        networkMonitor = mockk()
        every { networkMonitor.isOnline } returns online
        online.value = true
        tasksFlow.value = listOf(task(1), task(2), task(3))
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel() = MyDayViewModel(api, preferences, useCase, networkMonitor)

    /** tasks — WhileSubscribed: без подписчика не считается. */
    private fun kotlinx.coroutines.test.TestScope.subscribe(vm: MyDayViewModel) {
        backgroundScope.launch(dispatcher) { vm.tasks.collect {} }
    }

    @Test
    fun `tasks are null until cache is read, then the day route`() = runTest(dispatcher) {
        val vm = viewModel()
        assertNull(vm.tasks.value)
        subscribe(vm)
        advanceUntilIdle()
        assertEquals(listOf(1L, 2L, 3L), vm.tasks.value?.map { it.id })
    }

    @Test
    fun `refresh takes the order from server`() = runTest(dispatcher) {
        coEvery { api.getMyDay(today) } returns dayResponse(3, 1, 2)
        val vm = viewModel()
        subscribe(vm)
        vm.refresh()
        advanceUntilIdle()

        assertEquals(listOf(3L, 1L, 2L), vm.tasks.value?.map { it.id })
        assertNull(vm.message.value)
        assertFalse(vm.isRefreshing.value)
        assertEquals(listOf(3L, 1L, 2L), preferences.getDayRoute(today))
    }

    @Test
    fun `offline move keeps the order on device and says it will be sent`() = runTest(dispatcher) {
        coEvery { api.getMyDay(today) } throws IOException("нет сети")
        val vm = viewModel()
        subscribe(vm)
        advanceUntilIdle()

        vm.move(3L, -1)
        advanceUntilIdle()

        assertEquals(listOf(1L, 3L, 2L), vm.tasks.value?.map { it.id })
        assertTrue(preferences.isDayRoutePending(today))
        assertTrue(vm.message.value!!.contains("когда появится связь"))
        // Перестановка не перечитывает все заявки
        coVerify(exactly = 0) { useCase.refreshTasks() }
    }

    @Test
    fun `order moved offline is sent when network is back`() = runTest(dispatcher) {
        online.value = false
        coEvery { api.getMyDay(today) } throws IOException("нет сети")
        val vm = viewModel()
        subscribe(vm)
        advanceUntilIdle()
        vm.move(3L, -1)
        advanceUntilIdle()

        coEvery { api.getMyDay(today) } returns dayResponse(1, 2, 3)
        coEvery { api.saveDayRoute(today, any()) } answers { Response.success(secondArg()) }
        online.value = true
        advanceUntilIdle()

        coVerify { api.saveDayRoute(today, DayRouteRequest(listOf(1L, 3L, 2L))) }
        assertFalse(preferences.isDayRoutePending(today))
        assertNull(vm.message.value)
    }

    @Test
    fun `move while the previous save is in flight is not overwritten`() = runTest(dispatcher) {
        coEvery { api.getMyDay(today) } returns dayResponse(1, 2, 3)
        val firstSave = CompletableDeferred<Response<DayRouteRequest>>()
        val saved = mutableListOf<List<Long>>()
        coEvery { api.saveDayRoute(today, any()) } coAnswers {
            val body = secondArg<DayRouteRequest>()
            saved += body.task_ids
            if (saved.size == 1) firstSave.await() else Response.success(body)
        }
        val vm = viewModel()
        subscribe(vm)
        advanceUntilIdle()

        vm.move(3L, -1) // 1,3,2 — запрос повис
        advanceUntilIdle()
        vm.move(1L, 1) // 3,1,2 — пока первый ещё в пути
        firstSave.complete(Response.success(DayRouteRequest(listOf(1L, 3L, 2L))))
        advanceUntilIdle()

        assertEquals(listOf(3L, 1L, 2L), vm.tasks.value?.map { it.id })
        assertEquals(listOf(3L, 1L, 2L), saved.last())
        assertEquals(listOf(3L, 1L, 2L), preferences.getDayRoute(today))
        assertFalse(preferences.isDayRoutePending(today))
    }

    @Test
    fun `server error keeps cached tasks and explains`() = runTest(dispatcher) {
        coEvery { api.getMyDay(today) } returns Response.error(503, "".toResponseBody())
        val vm = viewModel()
        subscribe(vm)
        vm.refresh()
        advanceUntilIdle()

        assertNotNull(vm.message.value)
        assertTrue(vm.message.value!!.contains("503"))
        assertEquals(3, vm.tasks.value?.size)
    }

    @Test
    fun `repeated refresh while refreshing does not start a second one`() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        coEvery { useCase.refreshTasks() } coAnswers { gate.await(); Result.success(emptyList()) }
        coEvery { api.getMyDay(today) } returns dayResponse(1, 2, 3)
        val vm = viewModel()
        vm.refresh()
        advanceUntilIdle()
        assertTrue(vm.isRefreshing.value)
        vm.refresh()
        gate.complete(Unit)
        advanceUntilIdle()

        coVerify(exactly = 1) { useCase.refreshTasks() }
        assertFalse(vm.isRefreshing.value)
    }

    private companion object {
        const val ME = 7L
    }
}
