package com.fieldworker.ui.addresses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.data.repository.AddressRepository
import com.fieldworker.domain.model.AddressDetails
import com.fieldworker.domain.model.AddressSummary
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Состояние раздела «Мои адреса».
 */
data class MyAddressesUiState(
    val addresses: List<AddressSummary> = emptyList(),
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val selected: AddressDetails? = null,
    val isLoadingDetails: Boolean = false,
    /** id панели, для которой сейчас выполняется открытие двери. */
    val openingPanelId: Long? = null,
    val error: String? = null,
    val message: String? = null,
)

@HiltViewModel
class MyAddressesViewModel @Inject constructor(
    private val addressRepository: AddressRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(MyAddressesUiState())
    val state: StateFlow<MyAddressesUiState> = _state.asStateFlow()

    init {
        loadAddresses()
    }

    fun loadAddresses() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            addressRepository.getMyAddresses()
                .onSuccess { list ->
                    _state.update {
                        it.copy(addresses = list, isLoading = false, hasLoaded = true)
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            hasLoaded = true,
                            error = e.message ?: "Не удалось загрузить адреса",
                        )
                    }
                }
        }
    }

    fun openAddress(addressId: Long) {
        _state.update { it.copy(isLoadingDetails = true, selected = null, error = null) }
        viewModelScope.launch {
            addressRepository.getAddressDetails(addressId)
                .onSuccess { details ->
                    _state.update { it.copy(selected = details, isLoadingDetails = false) }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            isLoadingDetails = false,
                            error = e.message ?: "Не удалось открыть карточку",
                        )
                    }
                }
        }
    }

    fun closeAddress() {
        _state.update { it.copy(selected = null, isLoadingDetails = false) }
    }

    fun openDoor(addressId: Long, panelId: Long) {
        if (_state.value.openingPanelId != null) return
        viewModelScope.launch {
            _state.update { it.copy(openingPanelId = panelId, error = null) }
            addressRepository.openDoor(addressId, panelId)
                .onSuccess {
                    _state.update {
                        it.copy(openingPanelId = null, message = "Дверь открыта")
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            openingPanelId = null,
                            error = e.message ?: "Не удалось открыть дверь",
                        )
                    }
                }
        }
    }

    fun consumeMessage() {
        _state.update { it.copy(message = null) }
    }

    fun consumeError() {
        _state.update { it.copy(error = null) }
    }
}
