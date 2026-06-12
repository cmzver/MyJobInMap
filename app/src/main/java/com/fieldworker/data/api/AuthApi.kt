package com.fieldworker.data.api

import com.fieldworker.data.dto.SimpleSuccessDto
import com.fieldworker.data.remote.generated.AppUpdateCheck
import com.fieldworker.data.remote.generated.PasswordChange
import com.fieldworker.data.remote.generated.ProfileUpdate
import com.fieldworker.data.remote.generated.RefreshRequest
import com.fieldworker.data.remote.generated.ReportSettingsResponse
import com.fieldworker.data.remote.generated.ReportSettingsUpdate
import com.fieldworker.data.remote.generated.Token
import com.fieldworker.data.remote.generated.UserResponse
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Query
import retrofit2.http.Streaming

/**
 * API для авторизации пользователей.
 */
interface AuthApi {
    
    /**
     * Авторизация пользователя
     * @param username Логин
     * @param password Пароль
     */
    @FormUrlEncoded
    @POST("api/auth/login")
    suspend fun login(
        @Field("username") username: String,
        @Field("password") password: String
    ): Response<Token>
    
    /**
     * Обновить access token с помощью refresh token.
     * Возвращает новую пару access + refresh токенов (ротация).
     */
    @POST("api/auth/refresh")
    suspend fun refreshToken(
        @Body request: RefreshRequest
    ): Response<Token>
    
    /**
     * Получить информацию о текущем пользователе
     */
    @GET("api/auth/me")
    suspend fun getCurrentUser(
        @Header("Authorization") token: String
    ): Response<UserResponse>
    
    /**
     * Обновить профиль текущего пользователя (имя/email/телефон).
     */
    @PATCH("api/auth/profile")
    suspend fun updateProfile(
        @Body body: ProfileUpdate
    ): Response<UserResponse>

    /**
     * Загрузить аватар текущего пользователя (multipart).
     * Поле формы: `avatar`. Лимит сервера: 5 МБ, jpg/png/webp/gif.
     */
    @Multipart
    @POST("api/auth/avatar")
    suspend fun uploadAvatar(
        @Part avatar: MultipartBody.Part
    ): Response<UserResponse>

    /**
     * Сменить пароль текущего пользователя.
     */
    @PATCH("api/auth/password")
    suspend fun changePassword(
        @Body body: PasswordChange
    ): Response<SimpleSuccessDto>

    /**
     * Получить настройки отправки отчётов
     */
    @GET("api/auth/report-settings")
    suspend fun getReportSettings(): Response<ReportSettingsResponse>

    /**
     * Обновить настройки отправки отчётов
     */
    @PUT("api/auth/report-settings")
    suspend fun updateReportSettings(
        @Body settings: ReportSettingsUpdate
    ): Response<ReportSettingsResponse>
    
    /**
     * Проверить наличие обновления приложения
     * @param versionCode текущий version code приложения
     * @param versionName текущая версия приложения
     */
    @GET("api/updates/check")
    suspend fun checkUpdate(
        @Query("version_code") versionCode: Int,
        @Query("version_name") versionName: String
    ): Response<AppUpdateCheck>
    
    /**
     * Скачать APK файл обновления
     */
    @Streaming
    @GET("api/updates/download")
    suspend fun downloadUpdate(): Response<ResponseBody>
}
