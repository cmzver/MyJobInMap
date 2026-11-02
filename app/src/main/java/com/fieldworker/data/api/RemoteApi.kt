package com.fieldworker.data.api

import com.fieldworker.data.remote.generated.PanelDoorActionResponse
import com.fieldworker.data.remote.generated.PanelLockStatusResponse
import com.fieldworker.data.remote.generated.PanelMifareScanCodeResponse
import com.fieldworker.data.remote.generated.RemoteResolveRequest
import com.fieldworker.data.remote.generated.TaskPanelResponse
import com.fieldworker.data.remote.generated.TaskResponse
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Удалённое решение из карточки заявки: панели домофона на её адресе.
 * Действия идут с task_id — сервер пишет их в историю заявки.
 */
interface RemoteApi {

    @GET("api/tasks/{id}/panels")
    suspend fun getTaskPanels(@Path("id") taskId: Long): Response<List<TaskPanelResponse>>

    @POST("api/addresses/{addressId}/panels/{panelId}/door/open")
    suspend fun openDoor(
        @Path("addressId") addressId: Long,
        @Path("panelId") panelId: Long,
        @Query("task_id") taskId: Long,
    ): Response<PanelDoorActionResponse>

    @GET("api/addresses/{addressId}/panels/{panelId}/lock-status")
    suspend fun getLockStatus(
        @Path("addressId") addressId: Long,
        @Path("panelId") panelId: Long,
    ): Response<PanelLockStatusResponse>

    @GET("api/addresses/{addressId}/panels/{panelId}/mifare-scan-code")
    suspend fun getScanCode(
        @Path("addressId") addressId: Long,
        @Path("panelId") panelId: Long,
        @Query("task_id") taskId: Long,
    ): Response<PanelMifareScanCodeResponse>

    /** JPEG-кадр с камеры панели — для просмотра видео (опрос раз в секунду). */
    @GET("api/addresses/{addressId}/panels/{panelId}/snapshot")
    suspend fun getSnapshot(
        @Path("addressId") addressId: Long,
        @Path("panelId") panelId: Long,
    ): Response<ResponseBody>

    /** Решено удалённо: назначить на себя, если никто не назначен, и закрыть. */
    @POST("api/tasks/{id}/resolve-remotely")
    suspend fun resolveRemotely(
        @Path("id") taskId: Long,
        @Body request: RemoteResolveRequest,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): Response<TaskResponse>
}
