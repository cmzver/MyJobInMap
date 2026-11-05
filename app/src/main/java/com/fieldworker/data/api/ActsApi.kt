package com.fieldworker.data.api

import com.fieldworker.data.remote.generated.ActPublicLink
import com.fieldworker.data.remote.generated.ActResponse
import com.fieldworker.data.remote.generated.CatalogItemResponse
import com.fieldworker.data.remote.generated.StockResponse
import com.fieldworker.data.remote.generated.TaskStatusLink
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Streaming

/**
 * Акты выполненных работ: прайс, акты заявки, акт с подписью клиента на экране.
 */
interface ActsApi {

    /** Прайс организации — строки акта; кешируется для работы без сети. */
    @GET("api/service-catalog")
    suspend fun getCatalog(): Response<List<CatalogItemResponse>>

    @GET("api/tasks/{id}/acts")
    suspend fun getTaskActs(@Path("id") taskId: Long): Response<List<ActResponse>>

    /**
     * Акт с телефона: payload — ActMobileCreate в JSON (ActCreate + время, место
     * и устройство подписи, причина отказа). Без подписи клиента и отказа акт
     * ждёт подписи. Повтор с тем же Idempotency-Key вернёт уже выпущенный акт.
     */
    @Multipart
    @POST("api/tasks/{id}/acts/mobile")
    suspend fun createMobileAct(
        @Path("id") taskId: Long,
        @Part("payload") payload: RequestBody,
        @Part customerSignature: MultipartBody.Part?,
        @Part workerSignature: MultipartBody.Part?,
        @Part("strokes") strokes: RequestBody?,
        @Header("Idempotency-Key") idempotencyKey: String? = null,
    ): Response<ActResponse>

    /** Ссылка клиенту: подписать акт или забрать PDF. Новая заменяет прежнюю. */
    @POST("api/acts/{id}/public-link")
    suspend fun createPublicLink(@Path("id") actId: Long): Response<ActPublicLink>

    @Streaming
    @GET("api/acts/{id}/pdf")
    suspend fun getActPdf(@Path("id") actId: Long): Response<ResponseBody>

    /** Материалы на руках у мастера — остатки склада; по акту списываются. */
    @GET("api/materials/stocks")
    suspend fun getMyStocks(): Response<List<StockResponse>>

    /** Ссылка заявителю на страницу статуса заявки — одна и та же при повторах. */
    @POST("api/tasks/{id}/status-link")
    suspend fun createTaskStatusLink(@Path("id") taskId: Long): Response<TaskStatusLink>
}
