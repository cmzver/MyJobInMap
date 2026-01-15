package com.fieldworker.data.api

import com.fieldworker.data.dto.CommentDto
import com.fieldworker.data.dto.CreateCommentDto
import com.fieldworker.data.dto.FCMTokenDto
import com.fieldworker.data.dto.PaginatedResponseDto
import com.fieldworker.data.dto.TaskDetailDto
import com.fieldworker.data.dto.TaskDto
import com.fieldworker.data.dto.TaskPhotoDto
import com.fieldworker.data.dto.UpdatePlannedDateDto
import com.fieldworker.data.dto.UpdateStatusDto
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit API интерфейс для работы с задачами.
 */
interface TasksApi {
    
    /**
     * Получить список всех задач
     * @param assignedToMe если true - только назначенные текущему пользователю
     */
    @GET("api/tasks")
    suspend fun getTasks(
        @Query("page") page: Int = 1,
        @Query("size") size: Int = 100, // Грузим по 100 для обратной совместимости пока не внедрим Paging 3
        @Query("status") status: String? = null,
        @Query("assigned_to_me") assignedToMe: Boolean = true
    ): Response<PaginatedResponseDto<TaskDto>>
    
    /**
     * Получить детальную информацию о задаче с комментариями
     */
    @GET("api/tasks/{id}")
    suspend fun getTaskDetail(
        @Path("id") id: Long
    ): Response<TaskDetailDto>
    
    /**
     * Обновить статус задачи с комментарием
     * @param id ID задачи
     * @param status Новый статус и комментарий
     */
    @PUT("api/tasks/{id}/status")
    suspend fun updateTaskStatus(
        @Path("id") id: Long,
        @Body status: UpdateStatusDto
    ): Response<TaskDetailDto>
    
    /**
     * Добавить комментарий к задаче
     */
    @POST("api/tasks/{id}/comments")
    suspend fun addComment(
        @Path("id") id: Long,
        @Body comment: CreateCommentDto
    ): Response<CommentDto>
    
    /**
     * Обновить планируемую дату выполнения
     */
    @PUT("api/tasks/{id}/planned-date")
    suspend fun updatePlannedDate(
        @Path("id") id: Long,
        @Body plannedDate: UpdatePlannedDateDto
    ): Response<TaskDto>
    
    /**
     * Получить комментарии к задаче
     */
    @GET("api/tasks/{id}/comments")
    suspend fun getComments(
        @Path("id") id: Long
    ): Response<List<CommentDto>>
    
    // ==================== Push Notifications ====================
    
    /**
     * Зарегистрировать FCM токен устройства
     */
    @POST("api/devices/register")
    suspend fun registerDevice(
        @Body token: FCMTokenDto
    ): Response<Unit>
    
    /**
     * Удалить регистрацию FCM токена
     */
    @DELETE("api/devices/unregister")
    suspend fun unregisterDevice(
        @Body token: FCMTokenDto
    ): Response<Unit>
    
    // ==================== Task Photos ====================
    
    /**
     * Получить все фото заявки
     */
    @GET("api/tasks/{id}/photos")
    suspend fun getTaskPhotos(
        @Path("id") taskId: Long
    ): Response<List<TaskPhotoDto>>
    
    /**
     * Загрузить фото к заявке
     */
    @Multipart
    @POST("api/tasks/{id}/photos")
    suspend fun uploadTaskPhoto(
        @Path("id") taskId: Long,
        @Part file: MultipartBody.Part,
        @Query("photo_type") photoType: String = "completion"
    ): Response<TaskPhotoDto>
    
    /**
     * Удалить фото
     */
    @DELETE("api/photos/{photoId}")
    suspend fun deletePhoto(
        @Path("photoId") photoId: Long
    ): Response<Unit>
}
