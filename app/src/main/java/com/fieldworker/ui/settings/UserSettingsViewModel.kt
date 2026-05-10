package com.fieldworker.ui.settings

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Состояние экрана «Настройки пользователя».
 */
data class UserSettingsUiState(
    val fullName: String = "",
    val username: String = "",
    val avatarUrl: String? = null,
    val isSavingName: Boolean = false,
    val isUploadingAvatar: Boolean = false,
    val isChangingPassword: Boolean = false,
    val error: String? = null,
    val message: String? = null,
)

@HiltViewModel
class UserSettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val preferences: AppPreferences,
) : ViewModel() {

    private val _state = MutableStateFlow(
        UserSettingsUiState(
            fullName = preferences.getUserFullName().orEmpty(),
            username = preferences.getUsername().orEmpty(),
            avatarUrl = preferences.getUserAvatarUrl(),
        )
    )
    val state: StateFlow<UserSettingsUiState> = _state.asStateFlow()

    init {
        // Подтягиваем актуальные данные с сервера, если есть сеть.
        viewModelScope.launch {
            authRepository.getCurrentUser().onSuccess { user ->
                _state.update {
                    it.copy(
                        fullName = user.fullName,
                        username = user.username,
                        avatarUrl = user.avatarUrl,
                    )
                }
            }
        }
    }

    fun saveName(newName: String) {
        val trimmed = newName.trim()
        if (trimmed.isEmpty()) {
            _state.update { it.copy(error = "Имя не может быть пустым") }
            return
        }
        if (trimmed == _state.value.fullName) {
            _state.update { it.copy(message = "Имя не изменилось") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isSavingName = true, error = null) }
            authRepository.updateProfile(fullName = trimmed)
                .onSuccess { user ->
                    _state.update {
                        it.copy(
                            isSavingName = false,
                            fullName = user.fullName,
                            avatarUrl = user.avatarUrl,
                            message = "Имя обновлено",
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(isSavingName = false, error = e.message ?: "Не удалось сохранить имя")
                    }
                }
        }
    }

    fun uploadAvatar(uri: Uri) {
        viewModelScope.launch {
            _state.update { it.copy(isUploadingAvatar = true, error = null) }
            authRepository.uploadAvatar(uri)
                .onSuccess { user ->
                    _state.update {
                        it.copy(
                            isUploadingAvatar = false,
                            avatarUrl = user.avatarUrl,
                            fullName = user.fullName,
                            message = "Аватар обновлён",
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(isUploadingAvatar = false, error = e.message ?: "Не удалось загрузить аватар")
                    }
                }
        }
    }

    fun changePassword(current: String, new: String, confirm: String, onSuccess: () -> Unit) {
        when {
            current.isBlank() -> {
                _state.update { it.copy(error = "Введите текущий пароль") }
                return
            }
            new.length < 6 -> {
                _state.update { it.copy(error = "Новый пароль должен быть не менее 6 символов") }
                return
            }
            new != confirm -> {
                _state.update { it.copy(error = "Пароли не совпадают") }
                return
            }
        }
        viewModelScope.launch {
            _state.update { it.copy(isChangingPassword = true, error = null) }
            authRepository.changePassword(current, new)
                .onSuccess {
                    _state.update {
                        it.copy(isChangingPassword = false, message = "Пароль изменён")
                    }
                    onSuccess()
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(isChangingPassword = false, error = e.message ?: "Не удалось сменить пароль")
                    }
                }
        }
    }

    fun consumeMessage() {
        _state.update { it.copy(message = null) }
    }

    fun consumeError() {
        _state.update { it.copy(error = null) }
    }
}
