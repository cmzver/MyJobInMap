package com.fieldworker.data.dto

import kotlinx.serialization.Serializable

/**
 * DTO ответа на проверку обновления
 */
@Serializable
data class UpdateCheckDto(
    val updateAvailable: Boolean,
    
    val currentVersion: String?,
    
    val update: UpdateInfoDto?
)

/**
 * DTO информации об обновлении
 */
@Serializable
data class UpdateInfoDto(
    val versionName: String,
    
    val versionCode: Int,
    
    val releaseNotes: String,
    
    val isMandatory: Boolean,
    
    val fileSize: Long?,
    
    val downloadUrl: String,
    
    val createdAt: String
)
