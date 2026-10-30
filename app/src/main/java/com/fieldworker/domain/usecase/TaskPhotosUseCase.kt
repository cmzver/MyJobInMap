package com.fieldworker.domain.usecase

import android.net.Uri
import com.fieldworker.data.repository.OfflineFirstTasksRepository
import com.fieldworker.domain.model.PendingPhoto
import com.fieldworker.domain.model.TaskPhoto
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * UseCase для работы с фотографиями задач.
 * Инкапсулирует бизнес-логику загрузки, скачивания и удаления фото.
 */
@Singleton
class TaskPhotosUseCase @Inject constructor(
    private val repository: OfflineFirstTasksRepository
) {
    
    /**
     * Получить список фотографий задачи
     */
    suspend fun getPhotos(taskId: Long): Result<List<TaskPhoto>> {
        return repository.getTaskPhotos(taskId)
    }
    
    /**
     * Поставить фото в очередь отправки — уйдёт сразу или когда появится связь.
     *
     * @param taskId ID задачи
     * @param imageUri URI изображения из галереи или камеры
     * @param photoType Тип фото: "before", "after", "completion"
     */
    suspend fun enqueuePhoto(
        taskId: Long,
        imageUri: Uri,
        photoType: String = "completion"
    ): Result<Unit> {
        return repository.enqueueTaskPhoto(taskId, imageUri, photoType)
    }

    /** Фото заявки, ещё не дошедшие до сервера. */
    fun pendingPhotos(taskId: Long): Flow<List<PendingPhoto>> =
        repository.pendingPhotosFlow(taskId)

    /** Отправить очередь сейчас. false — что-то не ушло и стоит повторить позже. */
    suspend fun sendPending(): Boolean {
        val result = repository.syncPendingActions()
        return result.retryableFailures == 0
    }

    /** Отменить отправку фото и удалить снимок с устройства. */
    suspend fun cancelPendingPhoto(pendingPhotoId: Long) {
        repository.discardFailedAction(pendingPhotoId)
    }
    
    /**
     * Удалить фото
     */
    suspend fun deletePhoto(photoId: Long): Result<Unit> {
        return repository.deletePhoto(photoId)
    }
}
