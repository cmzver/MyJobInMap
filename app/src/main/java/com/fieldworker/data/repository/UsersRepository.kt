package com.fieldworker.data.repository

import com.fieldworker.data.api.UsersApi
import com.fieldworker.data.mapper.toDomainUsers
import com.fieldworker.domain.model.User
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UsersRepository @Inject constructor(
    private val usersApi: UsersApi,
) {

    suspend fun getActiveUsers(): Result<List<User>> {
        return try {
            val response = usersApi.getUsers()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.toDomainUsers().filter { it.isActive })
            } else {
                Result.failure(Exception("Ошибка загрузки пользователей: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка подключения: ${e.message}"))
        }
    }
}