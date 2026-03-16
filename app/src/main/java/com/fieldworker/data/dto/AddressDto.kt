package com.fieldworker.data.dto

import com.google.gson.annotations.SerializedName

data class AddressParseRequestDto(
    @SerializedName("address")
    val address: String
)

data class AddressParseResponseDto(
    @SerializedName("city")
    val city: String? = null,

    @SerializedName("street")
    val street: String? = null,

    @SerializedName("building")
    val building: String? = null,

    @SerializedName("corpus")
    val corpus: String? = null,

    @SerializedName("entrance")
    val entrance: String? = null
)

data class AddressSearchDto(
    @SerializedName("id")
    val id: Long,

    @SerializedName("address")
    val address: String,

    @SerializedName("lat")
    val lat: Double? = null,

    @SerializedName("lon")
    val lon: Double? = null,

    @SerializedName("entrance_count")
    val entranceCount: Int? = null,

    @SerializedName("floor_count")
    val floorCount: Int? = null,

    @SerializedName("has_intercom")
    val hasIntercom: Boolean? = null,

    @SerializedName("intercom_code")
    val intercomCode: String? = null
)

data class AddressTaskStatsDto(
    @SerializedName("total")
    val total: Int = 0,

    @SerializedName("new")
    val newCount: Int = 0,

    @SerializedName("in_progress")
    val inProgress: Int = 0,

    @SerializedName("done")
    val done: Int = 0,

    @SerializedName("cancelled")
    val cancelled: Int = 0
)

data class AddressSystemDto(
    @SerializedName("id")
    val id: Long,

    @SerializedName("system_type")
    val systemType: String,

    @SerializedName("name")
    val name: String,

    @SerializedName("status")
    val status: String,

    @SerializedName("notes")
    val notes: String? = null
)

data class AddressEquipmentDto(
    @SerializedName("id")
    val id: Long,

    @SerializedName("equipment_type")
    val equipmentType: String,

    @SerializedName("name")
    val name: String,

    @SerializedName("model")
    val model: String? = null,

    @SerializedName("location")
    val location: String? = null,

    @SerializedName("status")
    val status: String,

    @SerializedName("quantity")
    val quantity: Int = 1
)

data class AddressDocumentDto(
    @SerializedName("id")
    val id: Long,

    @SerializedName("name")
    val name: String,

    @SerializedName("doc_type")
    val docType: String,

    @SerializedName("created_by_name")
    val createdByName: String? = null
)

data class AddressContactDto(
    @SerializedName("id")
    val id: Long,

    @SerializedName("contact_type")
    val contactType: String,

    @SerializedName("name")
    val name: String,

    @SerializedName("position")
    val position: String? = null,

    @SerializedName("phone")
    val phone: String? = null,

    @SerializedName("email")
    val email: String? = null,

    @SerializedName("is_primary")
    val isPrimary: Boolean = false
)

data class AddressHistoryDto(
    @SerializedName("id")
    val id: Long,

    @SerializedName("event_type")
    val eventType: String,

    @SerializedName("description")
    val description: String,

    @SerializedName("user_name")
    val userName: String? = null,

    @SerializedName("created_at")
    val createdAt: String
)

data class AddressFullDto(
    @SerializedName("id")
    val id: Long,

    @SerializedName("address")
    val address: String,

    @SerializedName("city")
    val city: String? = null,

    @SerializedName("street")
    val street: String? = null,

    @SerializedName("building")
    val building: String? = null,

    @SerializedName("corpus")
    val corpus: String? = null,

    @SerializedName("entrance")
    val entrance: String? = null,

    @SerializedName("entrance_count")
    val entranceCount: Int? = null,

    @SerializedName("floor_count")
    val floorCount: Int? = null,

    @SerializedName("apartment_count")
    val apartmentCount: Int? = null,

    @SerializedName("has_elevator")
    val hasElevator: Boolean? = null,

    @SerializedName("has_intercom")
    val hasIntercom: Boolean? = null,

    @SerializedName("intercom_code")
    val intercomCode: String? = null,

    @SerializedName("management_company")
    val managementCompany: String? = null,

    @SerializedName("management_phone")
    val managementPhone: String? = null,

    @SerializedName("notes")
    val notes: String? = null,

    @SerializedName("extra_info")
    val extraInfo: String? = null,

    @SerializedName("systems")
    val systems: List<AddressSystemDto> = emptyList(),

    @SerializedName("equipment")
    val equipment: List<AddressEquipmentDto> = emptyList(),

    @SerializedName("documents")
    val documents: List<AddressDocumentDto> = emptyList(),

    @SerializedName("contacts")
    val contacts: List<AddressContactDto> = emptyList(),

    @SerializedName("task_stats")
    val taskStats: AddressTaskStatsDto = AddressTaskStatsDto()
)