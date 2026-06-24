package com.fieldworker.data.repository

import android.content.Context
import android.net.Uri
import com.fieldworker.data.api.AuthApi
import com.fieldworker.data.image.ImageCompressor
import com.fieldworker.data.remote.generated.PasswordChange
import com.fieldworker.data.remote.generated.ProfileUpdate
import com.fieldworker.data.remote.generated.ReportSettingsResponse
import com.fieldworker.data.remote.generated.ReportSettingsUpdate
import com.fieldworker.data.remote.generated.Token
import com.fieldworker.data.remote.generated.UserResponse
import com.fieldworker.data.preferences.AppPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
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
    private val prefs: AppPreferences,
    private val imageCompressor: ImageCompressor,
    @ApplicationContext private val context: Context
) {
    
    /**
     * Авторизация пользователя
     */
    suspend fun login(username: String, password: String): Result<Token> {
        return try {
            val response = authApi.login(username, password)
            if (response.isSuccessful && response.body() != null) {
                val token = response.body()!!
                
                // Сохраняем данные авторизации (access + refresh tokens)
                prefs.setAuthToken(token.accessToken)
                prefs.setRefreshToken(token.refreshToken)
                prefs.setUserId(token.userId)
                prefs.setUsername(token.username)
                prefs.setUserFullName(token.fullName)
                prefs.setUserRole(token.role)
                prefs.setUserRoleLabel(token.roleLabel)
                prefs.setUserAvatarUrl(token.avatarUrl)
                
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
    suspend fun getCurrentUser(): Result<UserResponse> {
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
                val user = response.body()!!
                android.util.Log.d("AuthRepository", "getCurrentUser: Success, user = ${user.username}")
                // Сохраняем актуальные данные пользователя в настройки
                // (нужно для корректного определения «своих» сообщений в чате,
                // если поля не были записаны при логине)
                if (prefs.getUserId() <= 0) prefs.setUserId(user.id)
                if (prefs.getUsername().isNullOrBlank()) prefs.setUsername(user.username)
                if (prefs.getUserFullName().isNullOrBlank()) prefs.setUserFullName(user.fullName)
                if (prefs.getUserRole().isNullOrBlank()) prefs.setUserRole(user.role)
                // role_label и avatar_url синхронизируем всегда — могут меняться
                // без перелогина (переименование группы / смена аватара)
                prefs.setUserRoleLabel(user.roleLabel)
                prefs.setUserAvatarUrl(user.avatarUrl)
                Result.success(user)
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
    suspend fun getReportSettings(): Result<ReportSettingsResponse> {
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
    suspend fun updateReportSettings(reportTarget: String, contactPhone: String? = null): Result<ReportSettingsResponse> {
        return try {
            val settings = ReportSettingsUpdate(reportTarget, contactPhone)
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
     * Получить URL аватара пользователя (относительный путь от сервера).
     */
    fun getUserAvatarUrl(): String? = prefs.getUserAvatarUrl()

    /**
     * Обновить профиль (имя/email/телефон). Изменённые данные сохраняются в prefs.
     */
    suspend fun updateProfile(
        fullName: String? = null,
        email: String? = null,
        phone: String? = null
    ): Result<UserResponse> {
        return try {
            val response = authApi.updateProfile(ProfileUpdate(fullName, email, phone))
            if (response.isSuccessful && response.body() != null) {
                val user = response.body()!!
                prefs.setUserFullName(user.fullName)
                prefs.setUserAvatarUrl(user.avatarUrl)
                Result.success(user)
            } else {
                Result.failure(Exception(parseErrorDetail(response.errorBody()?.string()) ?: "Ошибка: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка подключения: ${e.message}"))
        }
    }

    /**
     * Загрузить новый аватар. Сервер вернёт обновлённого пользователя с avatar_url.
     */
    suspend fun uploadAvatar(uri: Uri): Result<UserResponse> {
        return try {
            // Сжимаем (ресайз до 1920px, JPEG q85). При ошибке декодирования
            // — отправляем оригинал, ограничивая размером 5 МБ как сервер.
            val compressed = imageCompressor.compress(uri, fileNamePrefix = "avatar")

            val bytes: ByteArray
            val mimeType: String
            val fileName: String
            if (compressed != null) {
                bytes = compressed.bytes
                mimeType = compressed.mimeType
                fileName = compressed.fileName
            } else {
                val resolver = context.contentResolver
                bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: return Result.failure(Exception("Не удалось открыть файл"))
                if (bytes.size > 5 * 1024 * 1024) {
                    return Result.failure(Exception("Размер файла не должен превышать 5 МБ"))
                }
                mimeType = resolver.getType(uri) ?: "image/jpeg"
                val extension = when {
                    mimeType.contains("png") -> "png"
                    mimeType.contains("webp") -> "webp"
                    mimeType.contains("gif") -> "gif"
                    else -> "jpg"
                }
                fileName = "avatar_${System.currentTimeMillis()}.$extension"
            }

            val requestBody = bytes.toRequestBody(mimeType.toMediaTypeOrNull())
            val part = MultipartBody.Part.createFormData("avatar", fileName, requestBody)

            val response = authApi.uploadAvatar(part)
            if (response.isSuccessful && response.body() != null) {
                val user = response.body()!!
                prefs.setUserAvatarUrl(user.avatarUrl)
                prefs.setUserFullName(user.fullName)
                Result.success(user)
            } else {
                Result.failure(Exception(parseErrorDetail(response.errorBody()?.string()) ?: "Ошибка: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка загрузки: ${e.message}"))
        }
    }

    /**
     * Сменить пароль текущего пользователя.
     */
    suspend fun changePassword(currentPassword: String, newPassword: String): Result<Unit> {
        return try {
            val response = authApi.changePassword(
                PasswordChange(currentPassword, newPassword)
            )
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(parseErrorDetail(response.errorBody()?.string()) ?: "Ошибка: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка подключения: ${e.message}"))
        }
    }

    /**
     * Достаёт поле `detail` из FastAPI-ошибки, если возможно.
     */
    private fun parseErrorDetail(body: String?): String? {
        if (body.isNullOrBlank()) return null
        return try {
            val detail = JSONObject(body).opt("detail")
            detail?.toString()?.takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }
    
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
