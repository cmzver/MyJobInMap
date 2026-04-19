package com.fieldworker.next.features.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.next.domain.model.ChatMessage
import com.fieldworker.next.domain.usecase.GetMessagesUseCase
import com.fieldworker.next.domain.usecase.MarkReadUseCase
import com.fieldworker.next.domain.usecase.SendMessageUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val messageInput: String = "",
    val isLoading: Boolean = true,
    val isSending: Boolean = false,
    val hasMore: Boolean = false,
    val isLoadingMore: Boolean = false,
    val conversationName: String = "",
)

class ChatViewModel(
    private val getMessagesUseCase: GetMessagesUseCase,
    private val sendMessageUseCase: SendMessageUseCase,
    private val markReadUseCase: MarkReadUseCase,
) : ViewModel() {

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    private var conversationId: Long = 0

    fun load(conversationId: Long, conversationName: String) {
        this.conversationId = conversationId
        _state.update { it.copy(conversationName = conversationName) }
        viewModelScope.launch {
            try {
                val page = getMessagesUseCase(conversationId)
                _state.update {
                    it.copy(
                        messages = page.items,
                        hasMore = page.hasMore,
                        isLoading = false,
                    )
                }
                // Mark as read
                page.items.firstOrNull()?.let { latest ->
                    markReadUseCase(conversationId, latest.id)
                }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false) }
            }
        }
    }

    fun loadMore() {
        val current = _state.value
        if (current.isLoadingMore || !current.hasMore) return
        val oldestId = current.messages.lastOrNull()?.id ?: return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                val page = getMessagesUseCase(conversationId, beforeId = oldestId)
                _state.update {
                    it.copy(
                        messages = it.messages + page.items,
                        hasMore = page.hasMore,
                        isLoadingMore = false,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun onMessageInputChange(text: String) {
        _state.update { it.copy(messageInput = text) }
    }

    fun sendMessage() {
        val text = _state.value.messageInput.trim()
        if (text.isBlank() || _state.value.isSending) return

        _state.update { it.copy(isSending = true) }
        viewModelScope.launch {
            try {
                val msg = sendMessageUseCase(conversationId, text)
                _state.update {
                    it.copy(
                        messages = listOf(msg) + it.messages,
                        messageInput = "",
                        isSending = false,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(isSending = false) }
            }
        }
    }
}
