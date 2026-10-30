package com.fieldworker.data.repository

import com.fieldworker.data.api.UsersApi
import com.fieldworker.data.mapper.toDomainUsers
import com.fieldworker.domain.model.User
import kotlinx.coroutines.CancellationException
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

    suspend fun getAssignableWorkers(): Result<List<User>> {
        return try {
            val response = usersApi.getWorkers()
            val body = response.body()
            if (response.isSuccessful && body != null) {
                Result.success(
                    body.toDomainUsers()
                        .filter { it.isActive }
                        .sortedBy { it.getDisplayName().lowercase() }
                )
            } else {
                Result.failure(Exception("Ошибка загрузки исполнителей: ${response.code()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(Exception("Ошибка подключения: ${e.message}"))
        }
    }
}