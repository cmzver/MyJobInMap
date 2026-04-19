package com.fieldworker.next.features.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.next.domain.model.AppError
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.Credentials
import com.fieldworker.next.domain.model.ServerEnvironment
import com.fieldworker.next.domain.usecase.GetAvailableEnvironmentsUseCase
import com.fieldworker.next.domain.usecase.SignInUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val username: String = "",
    val password: String = "",
    val selectedEnvironmentId: String = "",
    val environments: List<ServerEnvironment> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

class LoginViewModel(
    private val signInUseCase: SignInUseCase,
    getAvailableEnvironmentsUseCase: GetAvailableEnvironmentsUseCase,
) : ViewModel() {

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        val envs = getAvailableEnvironmentsUseCase()
        _state.update {
            it.copy(
                environments = envs,
                selectedEnvironmentId = envs.firstOrNull { e -> e.isDefault }?.id.orEmpty(),
            )
        }
    }

    fun onUsernameChanged(value: String) {
        _state.update { it.copy(username = value, error = null) }
    }

    fun onPasswordChanged(value: String) {
        _state.update { it.copy(password = value, error = null) }
    }

    fun onEnvironmentSelected(id: String) {
        _state.update { it.copy(selectedEnvironmentId = id) }
    }

    fun signIn() {
        val current = _state.value
        if (current.isLoading) return

        _state.update { it.copy(isLoading = true, error = null) }

        viewModelScope.launch {
            val result = signInUseCase(
                credentials = Credentials(
                    username = current.username,
                    password = current.password,
                ),
                environmentId = current.selectedEnvironmentId,
            )
            _state.update {
                when (result) {
                    is AppResult.Success -> it.copy(isLoading = false)
                    is AppResult.Failure -> it.copy(
                        isLoading = false,
                        error = result.error.toMessage(),
                    )
                }
            }
        }
    }
}

private fun AppError.toMessage(): String = when (this) {
    is AppError.Network -> message
    is AppError.NotFound -> "$entity not found"
    is AppError.Unknown -> message
    is AppError.Validation -> message
    AppError.Unauthorized -> "Неверный логин или пароль"
}
