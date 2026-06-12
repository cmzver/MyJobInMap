package com.fieldworker.data.api

import com.fieldworker.data.remote.generated.AddressFullResponse
import com.fieldworker.data.remote.generated.AddressHistoryResponse
import com.fieldworker.data.remote.generated.AddressParseRequest
import com.fieldworker.data.remote.generated.AddressParseResponse
import com.fieldworker.data.remote.generated.AddressSearchResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface AddressesApi {

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