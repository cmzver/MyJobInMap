package com.fieldworker.data.mapper

import com.fieldworker.data.dto.CommentDto
import com.fieldworker.data.dto.TaskDetailDto
import com.fieldworker.data.dto.TaskDto
import com.fieldworker.data.dto.TaskPhotoDto
import com.fieldworker.data.dto.TokenResponse
import com.fieldworker.data.dto.UserDto
import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskPhoto
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.domain.model.User
import com.fieldworker.domain.model.UserRole

/**
 * Маперы для конвертации DTO → Domain модели.
 * 
 * Централизованное место для всех преобразований данных из сети в доменные модели.
 * Убирает дублирование кода из репозиториев.
 */

// ==================== Task Mappers ====================

/**
 * Конвертация TaskDto в Domain Task
 */
fun TaskDto.toDomain(): Task = Task(
    id = id,
    taskNumber = taskNumber ?: "Z-$id",
    title = title,
    address = rawAddress ?: "",
    description = description ?: "",
    lat = lat,
    lon = lon,
    status = TaskStatus.fromString(status),
    priority = Priority.fromInt(priority),
    createdAt = createdAt ?: "",
    updatedAt = updatedAt ?: "",
    plannedDate = plannedDate,
    commentsCount = commentsCount
)

/**
 * Конвертация списка TaskDto в список Domain Task
 */
fun List<TaskDto>.toDomainTasks(): List<Task> = map { it.toDomain() }

/**
 * Конвертация TaskDetailDto в Domain Task
 */
fun TaskDetailDto.toDomain(): Task = Task(
    id = id,
    taskNumber = taskNumber ?: "Z-$id",
    title = title,
    address = rawAddress ?: "",
    description = description ?: "",
    lat = lat,
    lon = lon,
    status = TaskStatus.fromString(status),
    priority = Priority.fromInt(priority),
    createdAt = createdAt ?: "",
    updatedAt = updatedAt ?: "",
    plannedDate = plannedDate,
    commentsCount = comments.size
)

/**
 * Извлечение комментариев из TaskDetailDto
 */
fun TaskDetailDto.toComments(): List<Comment> = comments.map { it.toDomain() }

// ==================== Comment Mappers ====================

/**
 * Конвертация CommentDto в Domain Comment
 */
fun CommentDto.toDomain(): Comment = Comment(
    id = id,
    taskId = taskId,
    text = text,
    author = author,
    oldStatus = oldStatus?.let { TaskStatus.fromString(it) },
    newStatus = newStatus?.let { TaskStatus.fromString(it) },
    createdAt = createdAt
)

/**
 * Конвертация списка CommentDto в список Domain Comment
 */
fun List<CommentDto>.toDomainComments(): List<Comment> = map { it.toDomain() }

// ==================== User Mappers ====================

/**
 * Конвертация UserDto в Domain User
 */
fun UserDto.toDomain(): User = User(
    id = id,
    username = username,
    fullName = fullName,
    email = email,
    phone = phone,
    role = UserRole.fromString(role),
    isActive = isActive
)

/**
 * Конвертация списка UserDto в список Domain User
 */
fun List<UserDto>.toDomainUsers(): List<User> = map { it.toDomain() }

/**
 * Конвертация TokenResponse в Domain User (для использования после логина)
 */
fun TokenResponse.toUser(): User = User(
    id = userId,
    username = username,
    fullName = fullName,
    role = UserRole.fromString(role),
    isActive = true
)

// ==================== Photo Mappers ====================

/**
 * Конвертация TaskPhotoDto в Domain TaskPhoto
 */
fun TaskPhotoDto.toDomain(): TaskPhoto = TaskPhoto(
    id = id,
    taskId = taskId,
    filename = filename,
    originalName = originalName,
    fileSize = fileSize,
    mimeType = mimeType,
    photoType = photoType,
    url = url,
    createdAt = createdAt,
    uploadedBy = uploadedBy
)

/**
 * Конвертация списка TaskPhotoDto в список Domain TaskPhoto
 */
fun List<TaskPhotoDto>.toDomainPhotos(): List<TaskPhoto> = map { it.toDomain() }
