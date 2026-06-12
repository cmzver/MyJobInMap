package com.fieldworker.data.api

import com.fieldworker.data.remote.generated.UserResponse
import retrofit2.Response
import retrofit2.http.GET

interface UsersApi {

    @GET("/api/users")
    suspend fun getUsers(): Response<List<UserResponse>>
}