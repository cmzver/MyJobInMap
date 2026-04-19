package com.fieldworker.next.features.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.next.domain.model.Conversation
import com.fieldworker.next.domain.usecase.ObserveConversationsUseCase
import com.fieldworker.next.domain.usecase.RefreshConversationsUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class ChatListUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
)

class ChatListViewModel(
    observeConversationsUseCase: ObserveConversationsUseCase,
    private val refreshConversationsUseCase: RefreshConversationsUseCase,
) : ViewModel() {

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val allConversations: StateFlow<List<Conversation>> = observeConversationsUseCase()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val conversations: StateFlow<List<Conversation>> = combine(
        allConversations,
        _searchQuery,
    ) { list, query ->
        if (query.isBlank()) list
        else list.filter { conv ->
            val name = conv.name.orEmpty()
            name.contains(query, ignoreCase = true) ||
                conv.lastMessage?.text?.contains(query, ignoreCase = true) == true
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _state = MutableStateFlow(ChatListUiState())
    val state: StateFlow<ChatListUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun onSearchQueryChanged(query: String) {
        _searchQuery.value = query
    }

    fun refresh() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isRefreshing = true, error = null)
            try {
                refreshConversationsUseCase()
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = "Не удалось загрузить чаты")
            } finally {
                _state.value = _state.value.copy(isLoading = false, isRefreshing = false)
            }
        }
    }
}
