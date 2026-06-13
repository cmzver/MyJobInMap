package com.fieldworker.data.mapper

import com.fieldworker.data.remote.generated.AddressContactResponse
import com.fieldworker.data.remote.generated.AddressDocumentResponse
import com.fieldworker.data.remote.generated.AddressEquipmentResponse
import com.fieldworker.data.remote.generated.AddressFullResponse
import com.fieldworker.data.remote.generated.AddressHistoryResponse
import com.fieldworker.data.remote.generated.AddressSystemResponse
import com.fieldworker.data.remote.generated.TaskStats
import com.fieldworker.domain.model.AddressContact
import com.fieldworker.domain.model.AddressDetails
import com.fieldworker.domain.model.AddressDocument
import com.fieldworker.domain.model.AddressEquipment
import com.fieldworker.domain.model.AddressHistoryEntry
import com.fieldworker.domain.model.AddressSystem
import com.fieldworker.domain.model.AddressTaskStats

fun TaskStats.toDomain(): AddressTaskStats = AddressTaskStats(
    total = total?.toInt() ?: 0,
    newCount = new?.toInt() ?: 0,
    inProgress = inProgress?.toInt() ?: 0,
    done = done?.toInt() ?: 0,
    cancelled = cancelled?.toInt() ?: 0
)

fun AddressSystemResponse.toDomain(): AddressSystem = AddressSystem(
    id = id,
    systemType = systemType.value,
    name = name,
    status = status?.value ?: "",
    notes = notes
)

fun AddressEquipmentResponse.toDomain(): AddressEquipment = AddressEquipment(
    id = id,
    equipmentType = equipmentType.value,
    name = name,
    model = model,
    location = location,
    status = status?.value ?: "",
    quantity = quantity?.toInt() ?: 1
)

fun AddressDocumentResponse.toDomain(): AddressDocument = AddressDocument(
    id = id,
    name = name,
    docType = docType.value,
    createdByName = createdByName
)

fun AddressContactResponse.toDomain(): AddressContact = AddressContact(
    id = id,
    contactType = contactType?.value ?: "",
    name = name,
    position = position,
    phone = phone,
    email = email,
    isPrimary = isPrimary ?: false
)

fun AddressHistoryResponse.toDomain(): AddressHistoryEntry = AddressHistoryEntry(
    id = id,
    eventType = eventType.value,
    description = description,
    userName = userName,
    createdAt = createdAt
)

fun AddressFullResponse.toDomain(history: List<AddressHistoryEntry>): AddressDetails = AddressDetails(
    id = id,
    address = address,
    city = city,
    street = street,
    building = building,
    corpus = corpus,
    entrance = entrance,
    entranceCount = entranceCount?.toInt(),
    floorCount = floorCount?.toInt(),
    apartmentCount = apartmentCount?.toInt(),
    hasElevator = hasElevator,
    hasIntercom = hasIntercom,
    intercomCode = intercomCode,
    managementCompany = managementCompany,
    managementPhone = managementPhone,
    notes = notes,
    extraInfo = extraInfo,
    systems = systems.orEmpty().map { it.toDomain() },
    equipment = equipment.orEmpty().map { it.toDomain() },
    documents = documents.orEmpty().map { it.toDomain() },
    contacts = contacts.orEmpty().map { it.toDomain() },
    taskStats = taskStats?.toDomain() ?: AddressTaskStats(),
    history = history
)
