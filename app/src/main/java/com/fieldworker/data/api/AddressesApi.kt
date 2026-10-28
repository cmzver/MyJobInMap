package com.fieldworker.data.api

import com.fieldworker.data.remote.generated.AddressFullResponse
import com.fieldworker.data.remote.generated.AddressHistoryResponse
import com.fieldworker.data.remote.generated.AddressListResponse
import com.fieldworker.data.remote.generated.AddressParseRequest
import com.fieldworker.data.remote.generated.AddressParseResponse
import com.fieldworker.data.remote.generated.AddressSearchResponse
import com.fieldworker.data.remote.generated.PanelDoorActionResponse
import com.fieldworker.data.remote.generated.PanelLockStatusResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface AddressesApi {

    /** Адреса, назначенные текущему пользователю («Мои адреса»). */
    @GET("api/addresses/my")
    suspend fun getMyAddresses(
        @Query("search") search: String? = null,
        @Query("page") page: Int = 1,
        @Query("size") size: Int = 100
    ): Response<AddressListResponse>

    /** Открыть дверь на сетевой панели. */
    @POST("api/addresses/{addressId}/panels/{panelId}/door/open")
    suspend fun openPanelDoor(
        @Path("addressId") addressId: Long,
        @Path("panelId") panelId: Long
    ): Response<PanelDoorActionResponse>

    /** Статус замка панели (read-only). */
    @GET("api/addresses/{addressId}/panels/{panelId}/lock-status")
    suspend fun getPanelLockStatus(
        @Path("addressId") addressId: Long,
        @Path("panelId") panelId: Long
    ): Response<PanelLockStatusResponse>

    @POST("api/addresses/parse")
    suspend fun parseAddress(
        @Body request: AddressParseRequest
    ): Response<AddressParseResponse>

    @GET("api/addresses/search")
    suspend fun searchAddresses(
        @Query("q") query: String,
        @Query("limit") limit: Int = 5
    ): Response<List<AddressSearchResponse>>

    @GET("api/addresses/{id}/full")
    suspend fun getAddressFull(
        @Path("id") addressId: Long
    ): Response<AddressFullResponse>

    @GET("api/addresses/{id}/history")
    suspend fun getAddressHistory(
        @Path("id") addressId: Long
    ): Response<List<AddressHistoryResponse>>
}