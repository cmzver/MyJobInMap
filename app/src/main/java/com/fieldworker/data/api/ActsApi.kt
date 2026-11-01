package com.fieldworker.data.api

import com.fieldworker.data.remote.generated.ActResponse
import com.fieldworker.data.remote.generated.CatalogItemResponse
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

    @Streaming
    @GET("api/acts/{id}/pdf")
    suspend fun getActPdf(@Path("id") actId: Long): Response<ResponseBody>
}
