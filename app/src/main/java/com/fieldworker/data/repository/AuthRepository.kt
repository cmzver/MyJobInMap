package com.fieldworker.data.repository

import com.fieldworker.data.api.AuthApi
import com.fieldworker.data.dto.ReportSettingsDto
import com.fieldworker.data.dto.TokenResponse
import com.fieldworker.data.dto.UpdateReportSettingsDto
import com.fieldworker.data.dto.UserDto
import com.fieldworker.data.preferences.AppPreferences
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Типизированные ошибки аутентификации.
 */
sealed class AuthException : Exception() {
    /** Пользователь не авторизован (нет токена) */
    class NotAuthenticated : AuthException()
    /** 401 Unauthorized - токен истёк или пользователь удалён */
    class Unauthorized : AuthException()
    /** Ошибка сервера (не 401) */
    class ServerError(val code: Int) : AuthException()
    /** Ошибка сети */
    class NetworkError(override val message: String?) : AuthException()
}

/**
 * Репозиторий для авторизации пользователей.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val authApi: AuthApi,
    private val prefs: AppPreferences
) {
    
    /**
     * Авторизация пользователя
     */
    suspend fun login(username: String, password: String): Result<TokenResponse> {
        return try {
            val response = authApi.login(username, password)
            if (response.isSuccessful && response.body() != null) {
                val token = response.body()!!
                
                // Сохраняем данные авторизации
                prefs.setAuthToken(token.accessToken)
                prefs.setUserId(token.userId)
                prefs.setUsername(token.username)
                prefs.setUserFullName(token.fullName)
                prefs.setUserRole(token.role)
                
                Result.success(token)
            } else {
                val errorMessage = when (response.code()) {
                    401 -> "Неверный логин или пароль"
                    else -> "Ошибка авторизации: ${response.code()}"
                }
                Result.failure(Exception(errorMessage))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка подключения: ${e.message}"))
        }
    }
    
    /**
     * Получить информацию о текущем пользователе
     */
    suspend fun getCurrentUser(): Result<UserDto> {
        val token = prefs.getAuthToken() 
        if (token == null) {
            android.util.Log.w("AuthRepository", "getCurrentUser: No token found")
            return Result.failure(AuthException.NotAuthenticated())
        }
        
        android.util.Log.d("AuthRepository", "getCurrentUser: Making request with token ${token.take(20)}...")
        
        return try {
            val response = authApi.getCurrentUser("Bearer $token")
            android.util.Log.d("AuthRepository", "getCurrentUser: Response code = ${response.code()}")
            
            if (response.isSuccessful && response.body() != null) {
                android.util.Log.d("AuthRepository", "getCurrentUser: Success, user = ${response.body()?.username}")
                Result.success(response.body()!!)
            } else {
                if (response.code() == 401) {
                    // Токен истёк или пользователь удалён
                    android.util.Log.w("AuthRepository", "getCurrentUser: 401 Unauthorized - user deleted or token expired")
                    prefs.logout()
                    Result.failure(AuthException.Unauthorized())
                } else {
                    android.util.Log.e("AuthRepository", "getCurrentUser: Server error ${response.code()}")
                    Result.failure(AuthException.ServerError(response.code()))
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("AuthRepository", "getCurrentUser: Network error - ${e.message}", e)
            Result.failure(AuthException.NetworkError(e.message))
        }
    }
    
    /**
     * Получить настройки отправки отчётов
     */
    suspend fun getReportSettings(): Result<ReportSettingsDto> {
        return try {
            val response = authApi.getReportSettings()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Ошибка получения настроек: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка подключения: ${e.message}"))
        }
    }
    
    /**
     * Обновить настройки отправки отчётов
     */
    suspend fun updateReportSettings(reportTarget: String, contactPhone: String? = null): Result<ReportSettingsDto> {
        return try {
            val settings = UpdateReportSettingsDto(reportTarget, contactPhone)
            val response = authApi.updateReportSettings(settings)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Ошибка сохранения настроек: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка подключения: ${e.message}"))
        }
    }
    
    /**
     * Проверить, авторизован ли пользователь
     */
    fun isLoggedIn(): Boolean = prefs.isLoggedIn()
    
    /**
     * Получить сохранённый токен
     */
    fun getAuthToken(): String? = prefs.getAuthToken()
    
    /**
     * Получить сохранённое имя пользователя
     */
    fun getUsername(): String? = prefs.getUsername()
    
    /**
     * Получить полное имя пользователя
     */
    fun getUserFullName(): String? = prefs.getUserFullName()
    
    /**
     * Получить роль пользователя
     */
    fun getUserRole(): String? = prefs.getUserRole()
    
    /**
     * Проверить валидность текущей сессии пользователя.
     * Используется при запуске приложения для обнаружения удалённых/заблокированных пользователей.
     * 
     * @return ValidationResult:
     * - VALID: сессия валидна
     * - INVALID: пользователь удалён или токен истёк (нужен logout)
     * - UNKNOWN: ошибка сети, невозможно проверить (не трогать сессию)
     */
    suspend fun validateCurrentUser(): ValidationResult {
        android.util.Log.d("AuthRepository", "validateCurrentUser: Starting validation...")
        
        if (!isLoggedIn()) {
            android.util.Log.w("AuthRepository", "validateCurrentUser: Not logged in -> INVALID")
            return ValidationResult.INVALID
        }
        
        val result = getCurrentUser().fold(
            onSuccess = { 
                android.util.Log.d("AuthRepository", "validateCurrentUser: Success -> VALID")
                ValidationResult.VALID 
            },
            onFailure = { error ->
                android.util.Log.w("AuthRepository", "validateCurrentUser: Error type = ${error::class.simpleName}")
                when (error) {
                    is AuthException.Unauthorized,
                    is AuthException.NotAuthenticated -> {
                        android.util.Log.w("AuthRepository", "validateCurrentUser: Auth error -> INVALID")
                        ValidationResult.INVALID
                    }
                    else -> {
                        android.util.Log.w("AuthRepository", "validateCurrentUser: Network error -> UNKNOWN")
                        ValidationResult.UNKNOWN  // Ошибка сети - не разлогиниваем
                    }
                }
            }
        )
        
        android.util.Log.d("AuthRepository", "validateCurrentUser: Final result = $result")
        return result
    }
    
    /**
     * Результат валидации сессии
     */
    enum class ValidationResult {
        VALID,    // Сессия валидна
        INVALID,  // Сессия невалидна, нужен logout
        UNKNOWN   // Невозможно проверить (ошибка сети)
    }
    
    /**
     * Выйти из аккаунта
     */
    fun logout() {
        prefs.logout()
    }
}
