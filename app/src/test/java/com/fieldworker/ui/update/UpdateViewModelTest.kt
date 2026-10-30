package com.fieldworker.ui.update

import com.fieldworker.data.network.NetworkMonitor
import com.fieldworker.data.network.ServerHealthCheck
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.remote.generated.AppUpdateCheck
import com.fieldworker.data.repository.UpdateRepository
import com.fieldworker.ui.components.UpdateState
import io.mockk.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class UpdateViewModelTest {

    companion object {
        @JvmStatic
        @BeforeClass
        fun setupClass() {
            mockkStatic(android.util.Log::class)
            every { android.util.Log.d(any(), any()) } returns 0
            every { android.util.Log.w(any(), any<String>()) } returns 0
            every { android.util.Log.e(any(), any(), any()) } returns 0
            mockkStatic(android.os.SystemClock::class)
            every { android.os.SystemClock.elapsedRealtime() } returns 1_000_000L
        }
    }

    private val testDispatcher = StandardTestDispatcher()
    private val updateRepository: UpdateRepository = mockk()
    private val preferences: AppPreferences = mockk(relaxed = true)
    private val networkMonitor: NetworkMonitor = mockk()
    private val serverHealthCheck: ServerHealthCheck = mockk()

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        every { preferences.getDismissedUpdateVersionCode() } returns -1
        every { networkMonitor.isCurrentlyOnline() } returns true
        every { serverHealthCheck.lastKnownReachable } returns true
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel() =
        UpdateViewModel(updateRepository, preferences, networkMonitor, serverHealthCheck)

    @Test
    fun `manual check without network answers at once`() = runTest {
        every { networkMonitor.isCurrentlyOnline() } returns false
        val viewModel = createViewModel()

        viewModel.checkForUpdate(versionCode = 1, versionName = "1.0", isManualCheck = true)

        assertEquals(UpdateState.Error(UpdateViewModel.NO_CONNECTION_MESSAGE), viewModel.updateState.value)
        coVerify(exactly = 0) { updateRepository.checkForUpdate(any(), any()) }
    }

    @Test
    fun `manual check skips the request when server is known to be down`() = runTest {
        every { serverHealthCheck.lastKnownReachable } returns false
        val viewModel = createViewModel()

        viewModel.checkForUpdate(versionCode = 1, versionName = "1.0", isManualCheck = true)

        assertEquals(UpdateState.Error(UpdateViewModel.NO_CONNECTION_MESSAGE), viewModel.updateState.value)
        coVerify(exactly = 0) { updateRepository.checkForUpdate(any(), any()) }
    }

    @Test
    fun `manual check gives up when the server does not answer`() = runTest {
        coEvery { updateRepository.checkForUpdate(any(), any()) } coAnswers { awaitCancellation() }
        val viewModel = createViewModel()

        viewModel.checkForUpdate(versionCode = 1, versionName = "1.0", isManualCheck = true)
        runCurrent()
        assertEquals(UpdateState.Checking, viewModel.updateState.value)

        advanceTimeBy(UpdateViewModel.MANUAL_CHECK_TIMEOUT_MS + 1)
        runCurrent()

        assertEquals(UpdateState.Error(UpdateViewModel.NO_CONNECTION_MESSAGE), viewModel.updateState.value)
    }

    @Test
    fun `manual check reports connection failure in plain words`() = runTest {
        coEvery { updateRepository.checkForUpdate(any(), any()) } returns
            Result.failure(java.net.ConnectException("failed to connect to /10.0.2.2 (port 8001)"))
        val viewModel = createViewModel()

        viewModel.checkForUpdate(versionCode = 1, versionName = "1.0", isManualCheck = true)
        advanceUntilIdle()

        assertEquals(UpdateState.Error(UpdateViewModel.NO_CONNECTION_MESSAGE), viewModel.updateState.value)
    }

    @Test
    fun `auto check without connection is retried once connection is back`() = runTest {
        every { networkMonitor.isCurrentlyOnline() } returns false
        coEvery { updateRepository.checkForUpdate(any(), any()) } returns
            Result.success(AppUpdateCheck(updateAvailable = false))
        val viewModel = createViewModel()

        viewModel.checkForUpdate(versionCode = 1, versionName = "1.0")
        advanceUntilIdle()
        assertNull(viewModel.updateState.value)

        every { networkMonitor.isCurrentlyOnline() } returns true
        viewModel.checkForUpdate(versionCode = 1, versionName = "1.0")
        advanceUntilIdle()

        coVerify(exactly = 1) { updateRepository.checkForUpdate(1, "1.0") }
    }
}
