package com.fieldworker.data.repository

import com.fieldworker.data.api.RemoteApi
import com.fieldworker.data.local.dao.TaskDao
import com.fieldworker.data.local.entity.TaskEntity
import com.fieldworker.data.mapper.toDomain
import com.fieldworker.data.remote.generated.RemoteResolveRequest
import com.fieldworker.data.remote.generated.TaskPanelResponse
import com.fieldworker.domain.model.Task
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

/** Код записи ключей с панели и включён ли режим записи на ней. */
data class ScanCode(val code: String?, val active: Boolean)

/**
 * Удалённое решение из карточки заявки: панели адреса, дверь, код ключей,
 * видео с камеры панели и «Решено удалённо». Только при связи — устройство отвечает
 * здесь и сейчас, в очередь такие действия не ставятся.
 */
@Singleton
class RemoteResolutionRepository @Inject constructor(
    private val remoteApi: RemoteApi,
    private val taskDao: TaskDao,
) {
    suspend fun panels(taskId: Long): Result<List<TaskPanelResponse>> =
        call("Панели недоступны") { remoteApi.getTaskPanels(taskId) }

    /** true — дверь открыта. */
    suspend fun openDoor(panel: TaskPanelResponse, taskId: Long): Result<Boolean> =
        call("Не удалось открыть дверь") {
            remoteApi.openDoor(panel.addressId, panel.id, taskId)
        }.map { it.isOpen }

    suspend fun lockStatus(panel: TaskPanelResponse): Result<Boolean> =
        call("Не удалось узнать статус замка") {
            remoteApi.getLockStatus(panel.addressId, panel.id)
        }.map { it.isOpen }

    suspend fun scanCode(panel: TaskPanelResponse, taskId: Long): Result<ScanCode> =
        call("Не удалось получить код") {
            remoteApi.getScanCode(panel.addressId, panel.id, taskId)
        }.map { ScanCode(it.code, it.active == true) }

    /** JPEG-кадр с камеры панели; тело читаем здесь же, вне главного потока. */
    suspend fun snapshot(panel: TaskPanelResponse): Result<ByteArray> {
        val response = call("Не удалось получить кадр") { remoteApi.getSnapshot(panel.addressId, panel.id) }
        return withContext(Dispatchers.IO) { response.mapCatching { body -> body.use { it.bytes() } } }
    }

    /**
     * Закрыть заявку как решённую удалённо. [idempotencyKey] — один на попытку:
     * повтор после потерянного ответа вернёт тот же результат. Заявка из
     * ответа сразу ложится в кеш — список и карточка видят «Выполнена».
     */
    suspend fun resolve(task: Task, comment: String, idempotencyKey: String): Result<Task> =
        call("Не удалось закрыть заявку") {
            remoteApi.resolveRemotely(
                task.id,
                RemoteResolveRequest(comment = comment.trim(), expectedVersion = task.version),
                idempotencyKey,
            )
        }.map { response ->
            val resolved = response.toDomain()
            withContext(Dispatchers.IO) { taskDao.upsertTask(TaskEntity.fromDomain(resolved)) }
            resolved
        }

    private suspend fun <T> call(fallback: String, request: suspend () -> Response<T>): Result<T> =
        withContext(Dispatchers.IO) {
            try {
                val response = request()
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    Result.success(body)
                } else {
                    Result.failure(Exception(errorText(response.code(), fallback)))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Result.failure(Exception("Нет связи с сервером", e))
            }
        }

    private fun errorText(code: Int, fallback: String): String = when (code) {
        403 -> "Нет доступа к этой панели"
        404 -> "Панель не найдена"
        409 -> "Заявка уже изменилась — обновите карточку"
        502 -> "Панель отвергла учётные данные"
        504 -> "Панель недоступна"
        else -> fallback
    }
}
