package com.fieldworker.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AddressParseRequestDto(
    val address: String
)

@Serializable
data class AddressParseResponseDto(
    val city: String? = null,

    val street: String? = null,

    val building: String? = null,

    val corpus: String? = null,

    val entrance: String? = null
)

@Serializable
data class AddressSearchDto(
    val id: Long,

    val address: String,

    val lat: Double? = null,

    val lon: Double? = null,

    val entranceCount: Int? = null,

    val floorCount: Int? = null,

    val hasIntercom: Boolean? = null,

    val intercomCode: String? = null
)

@Serializable
data class AddressTaskStatsDto(
    val total: Int = 0,

    @SerialName("new")
    val newCount: Int = 0,

    val inProgress: Int = 0,

    val done: Int = 0,

    val cancelled: Int = 0
)

@Serializable
data class AddressSystemDto(
    val id: Long,

    val systemType: String,

    val name: String,

    val status: String,

    val notes: String? = null
)

@Serializable
data class AddressEquipmentDto(
    val id: Long,

    val equipmentType: String,

    val name: String,

    val model: String? = null,

    val location: String? = null,

    val status: String,

    val quantity: Int = 1
)

@Serializable
data class AddressDocumentDto(
    val id: Long,

    val name: String,

    val docType: String,

    val createdByName: String? = null
)

@Serializable
data class AddressContactDto(
    val id: Long,

    val contactType: String,

    val name: String,

    val position: String? = null,

    val phone: String? = null,

    val email: String? = null,

    val isPrimary: Boolean = false
)

@Serializable
data class AddressHistoryDto(
    val id: Long,

    val eventType: String,

    val description: String,

    val userName: String? = null,

    val createdAt: String
)

@Serializable
data class AddressFullDto(
    val id: Long,

    val address: String,

    val city: String? = null,

    val street: String? = null,

    val building: String? = null,

    val corpus: String? = null,

    val entrance: String? = null,

    val entranceCount: Int? = null,

    val floorCount: Int? = null,

    val apartmentCount: Int? = null,

    val hasElevator: Boolean? = null,

    val hasIntercom: Boolean? = null,

    val intercomCode: String? = null,

    val managementCompany: String? = null,

    val managementPhone: String? = null,

    val notes: String? = null,

    val extraInfo: String? = null,

    val systems: List<AddressSystemDto> = emptyList(),

    val equipment: List<AddressEquipmentDto> = emptyList(),

    val documents: List<AddressDocumentDto> = emptyList(),

    val contacts: List<AddressContactDto> = emptyList(),

    val taskStats: AddressTaskStatsDto = AddressTaskStatsDto()
)