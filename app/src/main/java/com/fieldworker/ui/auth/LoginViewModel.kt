package com.fieldworker.ui.auth

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.AuthRepository
import com.fieldworker.data.repository.DeviceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Состояние экрана авторизации
 */
data class LoginState(
    val username: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val isLoggedIn: Boolean = false,
    val userFullName: String? = null
)

/**
 * ViewModel для экрана авторизации
 */
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val deviceRepository: DeviceRepository,
    val preferences: AppPreferences
) : ViewModel() {
    
    companion object {
        private const val TAG = "LoginViewModel"
    }
    
    private val _state = MutableStateFlow(LoginState())
    val state: StateFlow<LoginState> = _state.asStateFlow()
    
    init {
        // Проверяем, авторизован ли уже пользователь
        if (authRepository.isLoggedIn()) {
            _state.value = _state.value.copy(
                isLoggedIn = true,
                userFullName = authRepository.getUserFullName()
            )
            // Регистрируем устройство при повторном входе
            registerDevice()
        }
    }
    
    fun onUsernameChange(username: String) {
        _state.value = _state.value.copy(username = username, error = null)
    }
    
    fun onPasswordChange(password: String) {
        _state.value = _state.value.copy(password = password, error = null)
    }
    
    fun login() {
        val username = _state.value.username.trim()
        val password = _state.value.password
        
        if (username.isBlank()) {
            _state.value = _state.value.copy(error = "Введите логин")
            return
        }
        
        if (password.isBlank()) {
            _state.value = _state.value.copy(error = "Введите пароль")
            return
        }
        
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            
            val result = authRepository.login(username, password)
            
            result.fold(
                onSuccess = { token ->
                    _state.value = _state.value.copy(
                        isLoading = false,
                        isLoggedIn = true,
                        userFullName = token.fullName
                    )
                    // Регистрируем устройство после успешного входа
                    registerDevice()
                },
                onFailure = { exception ->
                    _state.value = _state.value.copy(
                        isLoading = false,
                        error = exception.message ?: "Ошибка авторизации"
                    )
                }
            )
        }
    }
    
    private fun registerDevice() {
        viewModelScope.launch {
            Log.d(TAG, "Registering device after login...")
            deviceRepository.registerDevice()
        }
    }
    
    fun logout() {
        authRepository.logout()
        _state.value = LoginState()
    }
    
    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }
}
