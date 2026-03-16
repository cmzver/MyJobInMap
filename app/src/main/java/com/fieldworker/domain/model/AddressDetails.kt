package com.fieldworker.domain.model

data class AddressTaskStats(
    val total: Int = 0,
    val newCount: Int = 0,
    val inProgress: Int = 0,
    val done: Int = 0,
    val cancelled: Int = 0
)

data class AddressSystem(
    val id: Long,
    val systemType: String,
    val name: String,
    val status: String,
    val notes: String? = null
)

data class AddressEquipment(
    val id: Long,
    val equipmentType: String,
    val name: String,
    val model: String? = null,
    val location: String? = null,
    val status: String,
    val quantity: Int = 1
)

data class AddressDocument(
    val id: Long,
    val name: String,
    val docType: String,
    val createdByName: String? = null
)

data class AddressContact(
    val id: Long,
    val contactType: String,
    val name: String,
    val position: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val isPrimary: Boolean = false
)

data class AddressHistoryEntry(
    val id: Long,
    val eventType: String,
    val description: String,
    val userName: String? = null,
    val createdAt: String
)

data class AddressDetails(
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
    val systems: List<AddressSystem> = emptyList(),
    val equipment: List<AddressEquipment> = emptyList(),
    val documents: List<AddressDocument> = emptyList(),
    val contacts: List<AddressContact> = emptyList(),
    val taskStats: AddressTaskStats = AddressTaskStats(),
    val history: List<AddressHistoryEntry> = emptyList()
)