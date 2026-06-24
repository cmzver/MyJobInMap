package com.fieldworker.data.mapper

import com.fieldworker.data.remote.generated.CommentResponse
import com.fieldworker.data.remote.generated.PhotoResponse
import com.fieldworker.data.remote.generated.TaskListResponse
import com.fieldworker.data.remote.generated.TaskResponse
import com.fieldworker.data.remote.generated.Token
import com.fieldworker.data.remote.generated.UserResponse
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
 * Конвертация TaskListResponse (краткий ответ списка) в Domain Task
 */
fun TaskListResponse.toDomain(): Task = Task(
    id = id,
    taskNumber = taskNumber ?: "Z-$id",
    title = title,
    address = rawAddress,
    description = description,
    customerName = customerName,
    customerPhone = customerPhone,
    lat = lat.toDouble(),
    lon = lon.toDouble(),
    status = TaskStatus.fromString(status.value),
    priority = Priority.fromString(priority.value),
    createdAt = createdAt,
    updatedAt = updatedAt,
    plannedDate = plannedDate,
    assignedUserId = assignedUserId,
    assignedUserName = assignedUserName,
    isRemote = isRemote ?: false,
    isPaid = isPaid ?: false,
    paymentAmount = paymentAmount?.toDouble() ?: 0.0,
    systemType = systemType,
    defectType = defectType,
    commentsCount = commentsCount?.toInt() ?: 0
)

/**
 * Конвертация списка TaskListResponse в список Domain Task
 */
fun List<TaskListResponse>.toDomainTasks(): List<Task> = map { it.toDomain() }

/**
 * Конвертация TaskResponse (полный ответ с историей комментариев) в Domain Task
 */
fun TaskResponse.toDomain(): Task = Task(
    id = id,
    taskNumber = taskNumber ?: "Z-$id",
    title = title,
    address = rawAddress,
    description = description,
    customerName = customerName,
    customerPhone = customerPhone,
    lat = lat.toDouble(),
    lon = lon.toDouble(),
    status = TaskStatus.fromString(status.value),
    priority = Priority.fromString(priority.value),
    createdAt = createdAt,
    updatedAt = updatedAt,
    plannedDate = plannedDate,
    assignedUserId = assignedUserId,
    assignedUserName = assignedUserName,
    isRemote = isRemote ?: false,
    isPaid = isPaid ?: false,
    paymentAmount = paymentAmount?.toDouble() ?: 0.0,
    systemType = systemType,
    defectType = defectType,
    commentsCount = comments?.size ?: 0
)

/**
 * Извлечение комментариев из TaskResponse
 */
fun TaskResponse.toComments(): List<Comment> = comments.orEmpty().map { it.toDomain() }

// ==================== Comment Mappers ====================

/**
 * Конвертация CommentResponse в Domain Comment
 */
fun CommentResponse.toDomain(): Comment = Comment(
    id = id,
    taskId = taskId,
    text = text,
    author = author,
    oldStatus = oldStatus?.let { TaskStatus.fromString(it) },
    newStatus = newStatus?.let { TaskStatus.fromString(it) },
    createdAt = createdAt
)

/**
 * Конвертация списка CommentResponse в список Domain Comment
 */
fun List<CommentResponse>.toDomainComments(): List<Comment> = map { it.toDomain() }

// ==================== User Mappers ====================

/**
 * Конвертация UserResponse в Domain User
 */
fun UserResponse.toDomain(): User = User(
    id = id,
    username = username,
    fullName = fullName,
    email = email,
    phone = phone,
    role = UserRole.fromString(role),
    isActive = isActive
)

/**
 * Конвертация списка UserResponse в список Domain User
 */
fun List<UserResponse>.toDomainUsers(): List<User> = map { it.toDomain() }

/**
 * Конвертация Token в Domain User (для использования после логина)
 */
fun Token.toUser(): User = User(
    id = userId,
    username = username,
    fullName = fullName,
    role = UserRole.fromString(role),
    isActive = true
)

// ==================== Photo Mappers ====================

/**
 * Конвертация PhotoResponse в Domain TaskPhoto
 */
fun PhotoResponse.toDomain(): TaskPhoto = TaskPhoto(
    id = id,
    taskId = taskId,
    filename = filename,
    originalName = originalName,
    fileSize = fileSize.toInt(),
    mimeType = mimeType,
    photoType = photoType,
    url = url,
    createdAt = createdAt,
    uploadedBy = uploadedBy
)

/**
 * Конвертация списка PhotoResponse в список Domain TaskPhoto
 */
fun List<PhotoResponse>.toDomainPhotos(): List<TaskPhoto> = map { it.toDomain() }
