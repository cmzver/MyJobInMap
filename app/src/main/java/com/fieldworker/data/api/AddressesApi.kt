package com.fieldworker.data.api

import com.fieldworker.data.dto.AddressFullDto
import com.fieldworker.data.dto.AddressHistoryDto
import com.fieldworker.data.dto.AddressParseRequestDto
import com.fieldworker.data.dto.AddressParseResponseDto
import com.fieldworker.data.dto.AddressSearchDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface AddressesApi {

    @POST("api/addresses/parse")
    suspend fun parseAddress(
        @Body request: AddressParseRequestDto
    ): Response<AddressParseResponseDto>

    @GET("api/addresses/search")
    suspend fun searchAddresses(
        @Query("q") query: String,
        @Query("limit") limit: Int = 5
    ): Response<List<AddressSearchDto>>

    @GET("api/addresses/{id}/full")
    suspend fun getAddressFull(
        @Path("id") addressId: Long
    ): Response<AddressFullDto>

    @GET("api/addresses/{id}/history")
    suspend fun getAddressHistory(
        @Path("id") addressId: Long
    ): Response<List<AddressHistoryDto>>
}