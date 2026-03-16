package com.fieldworker.ui.auth

import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.AuthRepository
import com.fieldworker.data.repository.DeviceRepository
import io.mockk.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {

    companion object {
        @JvmStatic
        @BeforeClass
        fun setupClass() {
            // Мокаем android.util.Log для юнит-тестов
            mockkStatic(android.util.Log::class)
            every { android.util.Log.d(any(), any()) } returns 0
            every { android.util.Log.w(any(), any<String>()) } returns 0
            every { android.util.Log.e(any(), any(), any()) } returns 0
            every { android.util.Log.e(any(), any()) } returns 0
        }
    }

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var authRepository: AuthRepository
    private lateinit var deviceRepository: DeviceRepository
    private lateinit var preferences: AppPreferences

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        authRepository = mockk(relaxed = true)
        deviceRepository = mockk(relaxed = true)
        preferences = mockk(relaxed = true)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): LoginViewModel {
        // По умолчанию не авторизован
        every { authRepository.isLoggedIn() } returns false
        return LoginViewModel(authRepository, deviceRepository, preferences)
    }

    // ==================== Инициализация ====================

    @Test
    fun `initial state is empty and not logged in`() {
        val viewModel = createViewModel()
        val state = viewModel.state.value

        assertEquals("", state.username)
        assertEquals("", state.password)
        assertFalse(state.isLoading)
        assertNull(state.error)
        assertFalse(state.isLoggedIn)
    }

    @Test
    fun `init checks existing session and sets loggedIn if token exists`() = runTest {
        every { authRepository.isLoggedIn() } returns true
        every { authRepository.getUserFullName() } returns "Иванов Иван"

        val viewModel = LoginViewModel(authRepository, deviceRepository, preferences)
        advanceUntilIdle()

        assertTrue(viewModel.state.value.isLoggedIn)
        assertEquals("Иванов Иван", viewModel.state.value.userFullName)
    }

    // ==================== Изменение полей ====================

    @Test
    fun `onUsernameChange updates username and clears error`() {
        val viewModel = createViewModel()
        viewModel.onUsernameChange("admin")

        assertEquals("admin", viewModel.state.value.username)
        assertNull(viewModel.state.value.error)
    }

    @Test
    fun `onPasswordChange updates password and clears error`() {
        val viewModel = createViewModel()
        viewModel.onPasswordChange("secret123")

        assertEquals("secret123", viewModel.state.value.password)
        assertNull(viewModel.state.value.error)
    }

    // ==================== Валидация ====================

    @Test
    fun `login with blank username shows error`() {
        val viewModel = createViewModel()
        viewModel.onUsernameChange("   ")
        viewModel.onPasswordChange("password")
        viewModel.login()

        assertEquals("Введите логин", viewModel.state.value.error)
        assertFalse(viewModel.state.value.isLoading)
    }

    @Test
    fun `login with blank password shows error`() {
        val viewModel = createViewModel()
        viewModel.onUsernameChange("admin")
        viewModel.onPasswordChange("")
        viewModel.login()

        assertEquals("Введите пароль", viewModel.state.value.error)
        assertFalse(viewModel.state.value.isLoading)
    }

    @Test
    fun `login with empty username shows error`() {
        val viewModel = createViewModel()
        viewModel.login()

        assertEquals("Введите логин", viewModel.state.value.error)
    }

    // ==================== Успешный логин ====================

    @Test
    fun `login success sets isLoggedIn and fullName`() = runTest {
        val viewModel = createViewModel()
        viewModel.onUsernameChange("admin")
        viewModel.onPasswordChange("admin")

        coEvery { authRepository.login("admin", "admin") } returns Result.success(
            mockk {
                every { fullName } returns "Администратор"
                every { userId } returns 1L
                every { username } returns "admin"
                every { role } returns "admin"
                every { accessToken } returns "test-token"
            }
        )

        viewModel.login()
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue(state.isLoggedIn)
        assertFalse(state.isLoading)
        assertEquals("Администратор", state.userFullName)
        assertNull(state.error)
    }

    @Test
    fun `login success triggers device registration`() = runTest {
        val viewModel = createViewModel()
        viewModel.onUsernameChange("admin")
        viewModel.onPasswordChange("admin")

        coEvery { authRepository.login("admin", "admin") } returns Result.success(
            mockk {
                every { fullName } returns "Test"
                every { userId } returns 1L
                every { username } returns "admin"
                every { role } returns "admin"
                every { accessToken } returns "test-token"
            }
        )

        viewModel.login()
        advanceUntilIdle()

        coVerify { deviceRepository.registerDevice() }
    }

    // ==================== Неудачный логин ====================

    @Test
    fun `login failure sets error message`() = runTest {
        val viewModel = createViewModel()
        viewModel.onUsernameChange("admin")
        viewModel.onPasswordChange("wrong")

        coEvery { authRepository.login("admin", "wrong") } returns Result.failure(
            Exception("Неверный логин или пароль")
        )

        viewModel.login()
        advanceUntilIdle()

        val state = viewModel.state.value
        assertFalse(state.isLoggedIn)
        assertFalse(state.isLoading)
        assertEquals("Неверный логин или пароль", state.error)
    }

    @Test
    fun `login failure with null message shows default error`() = runTest {
        val viewModel = createViewModel()
        viewModel.onUsernameChange("admin")
        viewModel.onPasswordChange("wrong")

        coEvery { authRepository.login("admin", "wrong") } returns Result.failure(
            Exception()
        )

        viewModel.login()
        advanceUntilIdle()

        assertEquals("Ошибка авторизации", viewModel.state.value.error)
    }

    @Test
    fun `login sets loading state during request`() = runTest {
        val viewModel = createViewModel()
        viewModel.onUsernameChange("admin")
        viewModel.onPasswordChange("admin")

        coEvery { authRepository.login(any(), any()) } coAnswers {
            // Эмулируем задержку сети
            kotlinx.coroutines.delay(1000)
            Result.success(mockk {
                every { fullName } returns "Test"
                every { userId } returns 1L
                every { username } returns "admin"
                every { role } returns "admin"
                every { accessToken } returns "test-token"
            })
        }

        viewModel.login()
        // Выполняем первый шаг: isLoading = true, затем приостановка на delay
        testDispatcher.scheduler.advanceTimeBy(1)
        assertTrue(viewModel.state.value.isLoading)

        advanceUntilIdle()
        assertFalse(viewModel.state.value.isLoading)
    }

    // ==================== Logout ====================

    @Test
    fun `logout clears state and calls repository`() {
        val viewModel = createViewModel()
        viewModel.logout()

        verify { authRepository.logout() }
        assertEquals(LoginState(), viewModel.state.value)
    }

    // ==================== clearError ====================

    @Test
    fun `clearError removes error from state`() {
        val viewModel = createViewModel()
        viewModel.onUsernameChange("") // пустой
        viewModel.login() // установит ошибку
        assertNotNull(viewModel.state.value.error)

        viewModel.clearError()
        assertNull(viewModel.state.value.error)
    }

    // ==================== Trim username ====================

    @Test
    fun `login trims whitespace from username`() = runTest {
        val viewModel = createViewModel()
        viewModel.onUsernameChange("  admin  ")
        viewModel.onPasswordChange("pass")

        coEvery { authRepository.login("admin", "pass") } returns Result.success(
            mockk {
                every { fullName } returns "Test"
                every { userId } returns 1L
                every { username } returns "admin"
                every { role } returns "admin"
                every { accessToken } returns "test-token"
            }
        )

        viewModel.login()
        advanceUntilIdle()

        coVerify { authRepository.login("admin", "pass") }
    }
}
