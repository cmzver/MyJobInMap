package com.fieldworker.data.api

import com.fieldworker.data.remote.generated.UserResponse
import retrofit2.Response
import retrofit2.http.GET

interface UsersApi {

    @GET("/api/users")
    suspend fun getUsers(): Response<List<UserResponse>>

    /** Исполнители для назначения заявок (только диспетчер/админ). */
    @GET("/api/admin/workers")
    suspend fun getWorkers(): Response<List<UserResponse>>
}