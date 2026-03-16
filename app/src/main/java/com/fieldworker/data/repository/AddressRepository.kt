package com.fieldworker.data.repository

import com.fieldworker.data.api.AddressesApi
import com.fieldworker.data.dto.AddressParseRequestDto
import com.fieldworker.data.mapper.toDomain
import com.fieldworker.domain.model.AddressDetails
import com.fieldworker.domain.model.Task
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AddressRepository @Inject constructor(
    private val addressesApi: AddressesApi
) {

    suspend fun findAddressForTask(task: Task): Result<AddressDetails?> = withContext(Dispatchers.IO) {
        try {
            val normalizedQuery = normalizeAddressQuery(task.address)
            if (normalizedQuery.length < 2) {
                return@withContext Result.success(null)
            }

            val parseResponse = addressesApi.parseAddress(AddressParseRequestDto(normalizedQuery))
            val parsedAddress = parseResponse.body()

            val searchCandidates = buildSearchCandidates(normalizedQuery, parsedAddress?.street, parsedAddress?.building)
            var matchedAddressId: Long? = null

            for (candidate in searchCandidates) {
                val response = addressesApi.searchAddresses(candidate, limit = 5)
                if (!response.isSuccessful) {
                    continue
                }

                val matches = response.body().orEmpty()
                val bestMatch = matches.firstOrNull { match ->
                    val normalizedAddress = match.address.lowercase()
                    val building = parsedAddress?.building?.lowercase()
                    val street = parsedAddress?.street?.lowercase()
                    val buildingMatches = building.isNullOrBlank() || normalizedAddress.contains(building)
                    val streetMatches = street.isNullOrBlank() || normalizedAddress.contains(street)
                    buildingMatches && streetMatches
                } ?: matches.firstOrNull()

                if (bestMatch != null) {
                    matchedAddressId = bestMatch.id
                    break
                }
            }

            if (matchedAddressId == null) {
                return@withContext Result.success(null)
            }

            val fullResponse = addressesApi.getAddressFull(matchedAddressId)
            if (!fullResponse.isSuccessful || fullResponse.body() == null) {
                return@withContext Result.failure(Exception("Не удалось загрузить карточку объекта"))
            }

            val historyResponse = addressesApi.getAddressHistory(matchedAddressId)
            val history = if (historyResponse.isSuccessful) {
                historyResponse.body().orEmpty().map { it.toDomain() }
            } else {
                emptyList()
            }

            Result.success(fullResponse.body()!!.toDomain(history))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun normalizeAddressQuery(address: String): String {
        return address
            .replace(Regex(""",?\s*(кв\.?|квартира)\s*\d+.*$""", RegexOption.IGNORE_CASE), "")
            .replace(Regex(""",?\s*(подъезд|парадная)\s*\d+.*$""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s+"""), " ")
            .trim()
    }

    private fun buildSearchCandidates(
        rawAddress: String,
        street: String?,
        building: String?
    ): List<String> {
        val candidates = linkedSetOf<String>()
        candidates += rawAddress
        if (!street.isNullOrBlank() && !building.isNullOrBlank()) {
            candidates += "$street $building"
            candidates += "$street, $building"
        }
        if (!street.isNullOrBlank()) {
            candidates += street
        }
        return candidates.filter { it.length >= 2 }
    }
}