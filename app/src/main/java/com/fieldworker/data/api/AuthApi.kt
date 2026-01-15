package com.fieldworker.data.api

import com.fieldworker.data.dto.ReportSettingsDto
import com.fieldworker.data.dto.TokenResponse
import com.fieldworker.data.dto.UpdateReportSettingsDto
import com.fieldworker.data.dto.UserDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PUT

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
     * Получить информацию о текущем пользователе
     */
    @GET("api/auth/me")
    suspend fun getCurrentUser(
        @Header("Authorization") token: String
    ): Response<UserDto>
    
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
}
