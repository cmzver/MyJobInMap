package com.fieldworker.data.dto

import com.google.gson.annotations.SerializedName

/**
 * DTO ответа на проверку обновления
 */
data class UpdateCheckDto(
    @SerializedName("update_available")
    val updateAvailable: Boolean,
    
    @SerializedName("current_version")
    val currentVersion: String?,
    
    @SerializedName("update")
    val update: UpdateInfoDto?
)

/**
 * DTO информации об обновлении
 */
data class UpdateInfoDto(
    @SerializedName("version_name")
    val versionName: String,
    
    @SerializedName("version_code")
    val versionCode: Int,
    
    @SerializedName("release_notes")
    val releaseNotes: String,
    
    @SerializedName("is_mandatory")
    val isMandatory: Boolean,
    
    @SerializedName("file_size")
    val fileSize: Long?,
    
    @SerializedName("download_url")
    val downloadUrl: String,
    
    @SerializedName("created_at")
    val createdAt: String
)
