package com.fieldworker.ui.remote

import com.fieldworker.data.network.NetworkMonitor
import com.fieldworker.data.remote.generated.TaskPanelResponse
import com.fieldworker.data.repository.RemoteResolutionRepository
import com.fieldworker.ui.preview.PreviewData
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TaskRemoteViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val repository = mockk<RemoteResolutionRepository>()
    private val network = mockk<NetworkMonitor> { every { isCurrentlyOnline() } returns true }
    private val task = PreviewData.taskInProgress.copy(addressId = 7)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `retry after a lost answer reuses the idempotency key`() = runTest(dispatcher) {
        val keys = mutableListOf<String>()
        coEvery { repository.resolve(task, any(), capture(keys)) } returnsMany listOf(
            Result.failure(Exception("Нет связи с сервером")),
            Result.success(task),
            Result.success(task),
        )
        val viewModel = TaskRemoteViewModel(repository, network)
        var resolved = 0

        viewModel.resolve(task, "Открыли дверь") { resolved++ }
        advanceUntilIdle()
        viewModel.resolve(task, "Открыли дверь") { resolved++ }
        advanceUntilIdle()
        viewModel.resolve(task, "Ещё раз") { resolved++ }
        advanceUntilIdle()

        assertEquals(keys[0], keys[1]) // повтор той же попытки
        assertNotEquals(keys[1], keys[2]) // после успеха — новая попытка
        assertEquals(2, resolved)
    }

    @Test
    fun `panel action reports the device error and refreshes the card`() = runTest(dispatcher) {
        val panel = TaskPanelResponse(id = 3, addressId = 7, label = "Подъезд 1")
        coEvery { repository.panels(task.id) } returns Result.success(listOf(panel))
        coEvery { repository.openDoor(panel, task.id) } returns Result.failure(Exception("Панель недоступна"))
        val viewModel = TaskRemoteViewModel(repository, network)
        var refreshed = 0

        viewModel.load(task)
        advanceUntilIdle()
        viewModel.openDoor(panel.id) { refreshed++ }
        advanceUntilIdle()

        val state = viewModel.state.value
        assertEquals("Панель недоступна", state.message)
        assertTrue(state.panels.none { it.isBusy })
        assertEquals(1, refreshed) // попытка тоже в истории заявки
        coVerify(exactly = 1) { repository.openDoor(panel, task.id) }
    }
}
