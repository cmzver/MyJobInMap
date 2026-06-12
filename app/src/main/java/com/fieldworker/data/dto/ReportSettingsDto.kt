package com.fieldworker.data.dto

import kotlinx.serialization.Serializable

/**
 * DTO для настроек отправки отчётов
 */
@Serializable
data class ReportSettingsDto(
    val reportTarget: String,  // "group", "contact", "none"

    val reportContactPhone: String?
)

/**
 * DTO для обновления настроек отчётов
 */
@Serializable
data class UpdateReportSettingsDto(
    val reportTarget: String,

    val reportContactPhone: String? = null
)
