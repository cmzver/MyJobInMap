package com.fieldworker.domain.usecase

import android.net.Uri
import com.fieldworker.data.repository.OfflineFirstTasksRepository
import com.fieldworker.domain.model.TaskPhoto
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
     * Загрузить фото к заявке
     * 
     * @param taskId ID задачи
     * @param imageUri URI изображения из галереи или камеры
     * @param photoType Тип фото: "before", "after", "completion"
     */
    suspend fun uploadPhoto(
        taskId: Long,
        imageUri: Uri,
        photoType: String = "completion"
    ): Result<TaskPhoto> {
        return repository.uploadTaskPhoto(taskId, imageUri, photoType)
    }
    
    /**
     * Удалить фото
     */
    suspend fun deletePhoto(photoId: Long): Result<Unit> {
        return repository.deletePhoto(photoId)
    }
}
