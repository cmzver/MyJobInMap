package com.fieldworker.data.api

import com.fieldworker.data.dto.ChangePasswordRequest
import com.fieldworker.data.dto.RefreshTokenRequest
import com.fieldworker.data.dto.ReportSettingsDto
import com.fieldworker.data.dto.SimpleSuccessDto
import com.fieldworker.data.dto.TokenResponse
import com.fieldworker.data.dto.UpdateCheckDto
import com.fieldworker.data.dto.UpdateProfileRequest
import com.fieldworker.data.dto.UpdateReportSettingsDto
import com.fieldworker.data.dto.UserDto
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
    ): Response<TokenResponse>
    
    /**
     * Обновить access token с помощью refresh token.
     * Возвращает новую пару access + refresh токенов (ротация).
     */
    @POST("api/auth/refresh")
    suspend fun refreshToken(
        @Body request: RefreshTokenRequest
    ): Response<TokenResponse>
    
    /**
     * Получить информацию о текущем пользователе
     */
    @GET("api/auth/me")
    suspend fun getCurrentUser(
        @Header("Authorization") token: String
    ): Response<UserDto>
    
    /**
     * Обновить профиль текущего пользователя (имя/email/телефон).
     */
    @PATCH("api/auth/profile")
    suspend fun updateProfile(
        @Body body: UpdateProfileRequest
    ): Response<UserDto>

    /**
     * Загрузить аватар текущего пользователя (multipart).
     * Поле формы: `avatar`. Лимит сервера: 5 МБ, jpg/png/webp/gif.
     */
    @Multipart
    @POST("api/auth/avatar")
    suspend fun uploadAvatar(
        @Part avatar: MultipartBody.Part
    ): Response<UserDto>

    /**
     * Сменить пароль текущего пользователя.
     */
    @PATCH("api/auth/password")
    suspend fun changePassword(
        @Body body: ChangePasswordRequest
    ): Response<SimpleSuccessDto>

    /**
     * Получить настройки отправки отчётов
     */
    @GET("api/auth/report-settings")
    suspend fun getReportSettings(): Response<ReportSettingsDto>
    
    /**
     * Обновить настройки отправки отчётов
     */
    @PUT("api/auth/report-settings")
    suspend fun updateReportSettings(
        @Body settings: UpdateReportSettingsDto
    ): Response<ReportSettingsDto>
    
    /**
     * Проверить наличие обновления приложения
     * @param versionCode текущий version code приложения
     * @param versionName текущая версия приложения
     */
    @GET("api/updates/check")
    suspend fun checkUpdate(
        @Query("version_code") versionCode: Int,
        @Query("version_name") versionName: String
    ): Response<UpdateCheckDto>
    
    /**
     * Скачать APK файл обновления
     */
    @Streaming
    @GET("api/updates/download")
    suspend fun downloadUpdate(): Response<ResponseBody>
}
