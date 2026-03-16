package com.fieldworker.data.mapper

import com.fieldworker.data.dto.AddressContactDto
import com.fieldworker.data.dto.AddressDocumentDto
import com.fieldworker.data.dto.AddressEquipmentDto
import com.fieldworker.data.dto.AddressFullDto
import com.fieldworker.data.dto.AddressHistoryDto
import com.fieldworker.data.dto.AddressSystemDto
import com.fieldworker.data.dto.AddressTaskStatsDto
import com.fieldworker.domain.model.AddressContact
import com.fieldworker.domain.model.AddressDetails
import com.fieldworker.domain.model.AddressDocument
import com.fieldworker.domain.model.AddressEquipment
import com.fieldworker.domain.model.AddressHistoryEntry
import com.fieldworker.domain.model.AddressSystem
import com.fieldworker.domain.model.AddressTaskStats

fun AddressTaskStatsDto.toDomain(): AddressTaskStats = AddressTaskStats(
    total = total,
    newCount = newCount,
    inProgress = inProgress,
    done = done,
    cancelled = cancelled
)

fun AddressSystemDto.toDomain(): AddressSystem = AddressSystem(
    id = id,
    systemType = systemType,
    name = name,
    status = status,
    notes = notes
)

fun AddressEquipmentDto.toDomain(): AddressEquipment = AddressEquipment(
    id = id,
    equipmentType = equipmentType,
    name = name,
    model = model,
    location = location,
    status = status,
    quantity = quantity
)

fun AddressDocumentDto.toDomain(): AddressDocument = AddressDocument(
    id = id,
    name = name,
    docType = docType,
    createdByName = createdByName
)

fun AddressContactDto.toDomain(): AddressContact = AddressContact(
    id = id,
    contactType = contactType,
    name = name,
    position = position,
    phone = phone,
    email = email,
    isPrimary = isPrimary
)

fun AddressHistoryDto.toDomain(): AddressHistoryEntry = AddressHistoryEntry(
    id = id,
    eventType = eventType,
    description = description,
    userName = userName,
    createdAt = createdAt
)

fun AddressFullDto.toDomain(history: List<AddressHistoryEntry>): AddressDetails = AddressDetails(
    id = id,
    address = address,
    city = city,
    street = street,
    building = building,
    corpus = corpus,
    entrance = entrance,
    entranceCount = entranceCount,
    floorCount = floorCount,
    apartmentCount = apartmentCount,
    hasElevator = hasElevator,
    hasIntercom = hasIntercom,
    intercomCode = intercomCode,
    managementCompany = managementCompany,
    managementPhone = managementPhone,
    notes = notes,
    extraInfo = extraInfo,
    systems = systems.map { it.toDomain() },
    equipment = equipment.map { it.toDomain() },
    documents = documents.map { it.toDomain() },
    contacts = contacts.map { it.toDomain() },
    taskStats = taskStats.toDomain(),
    history = history
)