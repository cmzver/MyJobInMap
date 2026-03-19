package com.fieldworker.ui.chat

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.ChatRepository
import com.fieldworker.data.repository.UsersRepository
import com.fieldworker.data.realtime.ChatRealtimeEvent
import com.fieldworker.data.realtime.ChatRealtimeEventType
import com.fieldworker.domain.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ConversationListState(
    val conversations: List<Conversation> = emptyList(),
    val selectedFilter: ConversationListFilter = ConversationListFilter.ACTIVE,
    val availableUsers: List<User> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingUsers: Boolean = false,
    val isCreatingConversation: Boolean = false,
    val error: String? = null,
)

enum class ConversationListFilter {
    ACTIVE,
    ARCHIVED,
}

data class ChatScreenState(
    val conversationId: Long? = null,
    val detail: ConversationDetail? = null,
    val messages: List<ChatMessage> = emptyList(),
    val hasMore: Boolean = false,
    val pendingUnreadAnchorMessageId: Long? = null,
    val isPreparingUnreadAnchor: Boolean = false,
    val isLoadingMessages: Boolean = false,
    val isSending: Boolean = false,
    val replyTo: ChatMessage? = null,
    val typingUsers: Map<Long, String> = emptyMap(),
    val readReceipts: Map<Long, Long> = emptyMap(),
    val isSavingConversation: Boolean = false,
    val activeManagementUserId: Long? = null,
    val error: String? = null,
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
    private val usersRepository: UsersRepository,
    private val preferences: AppPreferences,
) : ViewModel() {

    private val typingTimeoutJobs = mutableMapOf<Long, Job>()
    private val locallyReadMessageIds = mutableMapOf<Long, Long>()
    private var unreadAnchorLoadJob: Job? = null
    private var shouldResolveInitialUnreadAnchor = false
    private var unreadAnchorLoadAttempts = 0
    private var localTypingResetJob: Job? = null
    private var sentTypingActive = false

    private val _listState = MutableStateFlow(ConversationListState())
    val listState = _listState.asStateFlow()

    private val _chatState = MutableStateFlow(ChatScreenState())
    val chatState = _chatState.asStateFlow()

    private val _notifications = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val notifications: SharedFlow<String> = _notifications.asSharedFlow()

    private val _attachmentOpenEvents = MutableSharedFlow<AttachmentOpenEvent>(extraBufferCapacity = 4)
    val attachmentOpenEvents: SharedFlow<AttachmentOpenEvent> = _attachmentOpenEvents.asSharedFlow()

    init {
        loadConversations()
        chatRepository.connectRealtime()
        observeRealtimeEvents()
    }

    // ========================================================================
    // Conversation list
    // ========================================================================

    fun loadConversations(showLoading: Boolean = true) {
        viewModelScope.launch {
            if (showLoading) {
                _listState.update { it.copy(isLoading = true, error = null) }
            } else {
                _listState.update { it.copy(error = null) }
            }
            chatRepository.getConversations(includeArchived = true).fold(
                onSuccess = { list ->
                    _listState.update { it.copy(conversations = list, isLoading = false) }
                },
                onFailure = { e ->
                    _listState.update { it.copy(error = e.message, isLoading = false) }
                }
            )
        }
    }

    fun setConversationListFilter(filter: ConversationListFilter) {
        _listState.update { it.copy(selectedFilter = filter) }
    }

    fun loadAvailableUsers(force: Boolean = false) {
        val state = _listState.value
        if (state.isLoadingUsers) return
        if (!force && state.availableUsers.isNotEmpty()) return

        viewModelScope.launch {
            _listState.update { it.copy(isLoadingUsers = true, error = null) }
            usersRepository.getActiveUsers().fold(
                onSuccess = { users ->
                    _listState.update { current ->
                        current.copy(
                            availableUsers = users,
                            isLoadingUsers = false,
                        )
                    }
                },
                onFailure = { e ->
                    _listState.update { it.copy(isLoadingUsers = false, error = e.message) }
                }
            )
        }
    }

    fun createDirectConversation(userId: Long) {
        createConversation(
            type = ConversationType.DIRECT,
            name = null,
            memberUserIds = listOf(userId),
        )
    }

    fun createGroupConversation(name: String, memberUserIds: List<Long>) {
        val trimmedName = name.trim()
        if (trimmedName.isBlank()) {
            _listState.update { it.copy(error = "Введите название группы") }
            return
        }
        if (memberUserIds.isEmpty()) {
            _listState.update { it.copy(error = "Выберите хотя бы одного участника") }
            return
        }

        createConversation(
            type = ConversationType.GROUP,
            name = trimmedName,
            memberUserIds = memberUserIds,
        )
    }

    // ========================================================================
    // Open / close conversation
    // ========================================================================

    fun openConversation(conversationId: Long) {
        clearTypingUsers()
        unreadAnchorLoadJob?.cancel()
        unreadAnchorLoadAttempts = 0
        shouldResolveInitialUnreadAnchor = unreadCountForConversation(conversationId) > 0
        _chatState.update {
            ChatScreenState(
                conversationId = conversationId,
                isLoadingMessages = true,
                isPreparingUnreadAnchor = shouldResolveInitialUnreadAnchor,
            )
        }
        viewModelScope.launch {
            val initialLoadLimit = initialMessageLoadLimit(conversationId)
            // Load detail in parallel with messages
            launch {
                chatRepository.getConversationDetail(conversationId).fold(
                    onSuccess = { detail ->
                        val initialReadReceipts = detail.members
                            .filter { it.userId != preferences.getUserId() && it.lastReadMessageId != null }
                            .associate { it.userId to (it.lastReadMessageId ?: 0L) }
                        _chatState.update {
                            it.copy(
                                detail = detail,
                                readReceipts = initialReadReceipts,
                            )
                        }
                        maybeResolveInitialUnreadAnchor(conversationId)
                    },
                    onFailure = { /* ignore detail error */ }
                )
            }
            loadMessages(
                conversationId = conversationId,
                initial = true,
                limit = initialLoadLimit,
            )
        }
    }

    fun closeConversation() {
        clearTypingUsers()
        sendTypingStopped()
        unreadAnchorLoadJob?.cancel()
        unreadAnchorLoadAttempts = 0
        shouldResolveInitialUnreadAnchor = false
        _chatState.update { ChatScreenState() }
        // Refresh list to update unread counts
        loadConversations(showLoading = false)
    }

    // ========================================================================
    // Messages
    // ========================================================================

    private suspend fun loadMessages(
        conversationId: Long,
        initial: Boolean,
        showLoading: Boolean = true,
        limit: Int = DEFAULT_MESSAGE_PAGE_SIZE,
    ) {
        val beforeId = if (initial) null else _chatState.value.messages.minOfOrNull { it.id }
        if (showLoading) {
            _chatState.update { it.copy(isLoadingMessages = true) }
        }
        chatRepository.getMessages(conversationId, beforeId = beforeId, limit = limit).fold(
            onSuccess = { (msgs, hasMore) ->
                val combined = if (initial) {
                    msgs
                } else {
                    (_chatState.value.messages + msgs).distinctBy { it.id }
                }
                _chatState.update { state ->
                    state.copy(messages = combined, hasMore = hasMore, isLoadingMessages = false)
                }
                maybeResolveInitialUnreadAnchor(conversationId)
            },
            onFailure = { e ->
                _chatState.update { it.copy(error = e.message, isLoadingMessages = false) }
            }
        )
    }

    fun loadMoreMessages() {
        val convId = _chatState.value.conversationId ?: return
        if (_chatState.value.isLoadingMessages || !_chatState.value.hasMore) return
        viewModelScope.launch {
            loadMessages(convId, initial = false)
        }
    }

    fun markVisibleMessagesAsRead(messageId: Long) {
        val conversationId = _chatState.value.conversationId ?: return
        if (_chatState.value.isPreparingUnreadAnchor) return
        markConversationAsRead(conversationId, messageId)
    }

    fun consumeUnreadAnchor() {
        unreadAnchorLoadJob?.cancel()
        unreadAnchorLoadAttempts = 0
        shouldResolveInitialUnreadAnchor = false
        _chatState.update {
            it.copy(
                pendingUnreadAnchorMessageId = null,
                isPreparingUnreadAnchor = false,
            )
        }
    }

    fun sendMessage(text: String) {
        val convId = _chatState.value.conversationId ?: return
        val replyId = _chatState.value.replyTo?.id
        sendTypingStopped()
        _chatState.update { it.copy(isSending = true, replyTo = null) }
        viewModelScope.launch {
            chatRepository.sendMessage(convId, text, replyToId = replyId).fold(
                onSuccess = { msg ->
                    _chatState.update { state ->
                        state.copy(
                            messages = listOf(msg) + state.messages,
                            isSending = false,
                        )
                    }
                },
                onFailure = { e ->
                    _chatState.update { it.copy(error = e.message, isSending = false) }
                }
            )
        }
    }

    fun sendAttachment(fileUri: android.net.Uri) {
        val convId = _chatState.value.conversationId ?: return
        sendTypingStopped()
        _chatState.update { it.copy(isSending = true) }
        viewModelScope.launch {
            chatRepository.sendAttachment(convId, fileUri).fold(
                onSuccess = { msg ->
                    _chatState.update { state ->
                        state.copy(
                            messages = listOf(msg) + state.messages,
                            isSending = false,
                        )
                    }
                },
                onFailure = { e ->
                    _chatState.update { it.copy(error = e.message, isSending = false) }
                }
            )
        }
    }

    fun openAttachment(attachment: ChatAttachment) {
        viewModelScope.launch {
            chatRepository.downloadAttachment(attachment).fold(
                onSuccess = { downloaded ->
                    _attachmentOpenEvents.emit(
                        AttachmentOpenEvent(
                            uri = downloaded.uri,
                            mimeType = downloaded.mimeType,
                            fileName = downloaded.fileName,
                        )
                    )
                },
                onFailure = {
                    _notifications.emit("Не удалось открыть вложение")
                }
            )
        }
    }

    fun deleteMessage(messageId: Long) {
        viewModelScope.launch {
            chatRepository.deleteMessage(messageId).fold(
                onSuccess = { updated ->
                    replaceMessage(updated)
                },
                onFailure = { /* ignore */ }
            )
        }
    }

    fun toggleReaction(messageId: Long, emoji: String) {
        viewModelScope.launch {
            chatRepository.toggleReaction(messageId, emoji).fold(
                onSuccess = { updated ->
                    replaceMessage(updated)
                },
                onFailure = { /* ignore */ }
            )
        }
    }

    fun setReplyTo(message: ChatMessage?) {
        _chatState.update { it.copy(replyTo = message) }
    }

    fun clearError() {
        _chatState.update { it.copy(error = null) }
        _listState.update { it.copy(error = null) }
    }

    fun toggleConversationMute() {
        val conversationId = _chatState.value.conversationId ?: return
        val currentUserId = preferences.getUserId()
        val currentMember = _chatState.value.detail?.members?.firstOrNull { it.userId == currentUserId } ?: return
        val nextMuted = !currentMember.isMuted

        viewModelScope.launch {
            chatRepository.muteConversation(conversationId, nextMuted).fold(
                onSuccess = {
                    _chatState.update { state ->
                        val detail = state.detail ?: return@update state
                        state.copy(
                            detail = detail.copy(
                                members = detail.members.map { member ->
                                    if (member.userId == currentUserId) member.copy(isMuted = nextMuted) else member
                                }
                            )
                        )
                    }
                    _listState.update { state ->
                        state.copy(
                            conversations = state.conversations.map { conversation ->
                                if (conversation.id == conversationId) conversation.copy(isMuted = nextMuted) else conversation
                            }
                        )
                    }
                },
                onFailure = { e ->
                    _chatState.update { it.copy(error = e.message) }
                }
            )
        }
    }

    fun toggleConversationArchive() {
        val conversationId = _chatState.value.conversationId ?: return
        val currentMember = currentConversationMember() ?: return
        val nextArchived = !currentMember.isArchived

        viewModelScope.launch {
            chatRepository.archiveConversation(conversationId, nextArchived).fold(
                onSuccess = {
                    closeConversation()
                },
                onFailure = { e ->
                    _chatState.update { it.copy(error = e.message) }
                }
            )
        }
    }

    fun archiveConversationFromList(conversationId: Long) {
        val conversation = _listState.value.conversations.firstOrNull { it.id == conversationId } ?: return
        if (conversation.isArchived) return

        viewModelScope.launch {
            chatRepository.archiveConversation(conversationId, true).fold(
                onSuccess = {
                    _listState.update { state ->
                        state.copy(
                            conversations = state.conversations.map { item ->
                                if (item.id == conversationId) {
                                    item.copy(isArchived = true)
                                } else {
                                    item
                                }
                            }
                        )
                    }
                    _notifications.tryEmit("Чат перемещён в архив")
                },
                onFailure = { e ->
                    _listState.update { it.copy(error = e.message) }
                }
            )
        }
    }

    fun renameCurrentConversation(name: String) {
        val conversationId = _chatState.value.conversationId ?: return
        val trimmedName = name.trim()
        if (trimmedName.isBlank()) {
            _chatState.update { it.copy(error = "Название не может быть пустым") }
            return
        }

        _chatState.update { it.copy(isSavingConversation = true, error = null) }
        viewModelScope.launch {
            chatRepository.updateConversationName(conversationId, trimmedName).fold(
                onSuccess = {
                    reloadConversationState(conversationId)
                },
                onFailure = { e ->
                    _chatState.update { it.copy(isSavingConversation = false, error = e.message) }
                }
            )
        }
    }

    fun addConversationMembers(userIds: List<Long>) {
        val conversationId = _chatState.value.conversationId ?: return
        if (userIds.isEmpty()) return

        _chatState.update { it.copy(isSavingConversation = true, error = null) }
        viewModelScope.launch {
            chatRepository.addMembers(conversationId, userIds).fold(
                onSuccess = {
                    reloadConversationState(conversationId)
                },
                onFailure = { e ->
                    _chatState.update { it.copy(isSavingConversation = false, error = e.message) }
                }
            )
        }
    }

    fun removeConversationMember(userId: Long) {
        val conversationId = _chatState.value.conversationId ?: return

        _chatState.update { it.copy(activeManagementUserId = userId, error = null) }
        viewModelScope.launch {
            chatRepository.removeMember(conversationId, userId).fold(
                onSuccess = {
                    if (userId == preferences.getUserId()) {
                        _chatState.update { it.copy(activeManagementUserId = null) }
                        closeConversation()
                    } else {
                        reloadConversationState(conversationId, activeManagementUserId = null)
                    }
                },
                onFailure = { e ->
                    _chatState.update { it.copy(activeManagementUserId = null, error = e.message) }
                }
            )
        }
    }

    fun updateConversationMemberRole(userId: Long, role: String) {
        val conversationId = _chatState.value.conversationId ?: return

        _chatState.update { it.copy(activeManagementUserId = userId, error = null) }
        viewModelScope.launch {
            chatRepository.updateMemberRole(conversationId, userId, role).fold(
                onSuccess = {
                    reloadConversationState(conversationId, activeManagementUserId = null)
                },
                onFailure = { e ->
                    _chatState.update { it.copy(activeManagementUserId = null, error = e.message) }
                }
            )
        }
    }

    fun transferConversationOwnership(userId: Long) {
        val conversationId = _chatState.value.conversationId ?: return

        _chatState.update { it.copy(activeManagementUserId = userId, error = null) }
        viewModelScope.launch {
            chatRepository.transferOwnership(conversationId, userId).fold(
                onSuccess = {
                    reloadConversationState(conversationId, activeManagementUserId = null)
                },
                onFailure = { e ->
                    _chatState.update { it.copy(activeManagementUserId = null, error = e.message) }
                }
            )
        }
    }

    fun onMessageInputChanged(text: String) {
        val conversationId = _chatState.value.conversationId ?: return
        if (text.isBlank()) {
            sendTypingStopped()
            return
        }

        if (!sentTypingActive) {
            chatRepository.sendTypingIndicator(conversationId, true)
            sentTypingActive = true
        }

        localTypingResetJob?.cancel()
        localTypingResetJob = viewModelScope.launch {
            delay(TYPING_TIMEOUT_MS)
            sendTypingStopped()
        }
    }

    override fun onCleared() {
        clearTypingUsers()
        sendTypingStopped()
        chatRepository.disconnectRealtime()
        super.onCleared()
    }

    // ========================================================================
    // Internal
    // ========================================================================

    private fun observeRealtimeEvents() {
        viewModelScope.launch {
            chatRepository.realtimeEvents.collect { event ->
                when (event.type) {
                    ChatRealtimeEventType.MESSAGE_CREATED,
                    ChatRealtimeEventType.MESSAGE_EDITED,
                    ChatRealtimeEventType.MESSAGE_DELETED,
                    ChatRealtimeEventType.REACTION_CHANGED -> {
                        refreshConversation(event.conversationId, refreshMessages = true)
                    }

                    ChatRealtimeEventType.READ_UPDATED -> {
                        handleReadEvent(event.userId, event.conversationId, event.messageId)
                        loadConversations(showLoading = false)
                    }

                    ChatRealtimeEventType.TYPING_CHANGED -> {
                        handleTypingEvent(event.userId, event.conversationId, event.isTyping != false)
                    }

                    ChatRealtimeEventType.CONVERSATION_UPDATED -> {
                        handleConversationUpdated(event)
                    }
                }
            }
        }
    }

    private fun refreshConversation(conversationId: Long, refreshMessages: Boolean) {
        loadConversations(showLoading = false)

        if (_chatState.value.conversationId == conversationId && refreshMessages) {
            viewModelScope.launch {
                loadMessages(conversationId, initial = true, showLoading = false)
            }
        }
    }

    private fun refreshConversationDetail(conversationId: Long) {
        viewModelScope.launch {
            chatRepository.getConversationDetail(conversationId).fold(
                onSuccess = { detail ->
                    val initialReadReceipts = detail.members
                        .filter { it.userId != preferences.getUserId() && it.lastReadMessageId != null }
                        .associate { it.userId to (it.lastReadMessageId ?: 0L) }
                    _chatState.update {
                        it.copy(
                            detail = detail,
                            readReceipts = initialReadReceipts,
                            error = null,
                        )
                    }
                    maybeResolveInitialUnreadAnchor(conversationId)
                },
                onFailure = {
                    if (_chatState.value.conversationId == conversationId) {
                        closeConversation()
                    }
                }
            )
        }
    }

    private fun handleConversationUpdated(event: ChatRealtimeEvent) {
        val currentUserId = preferences.getUserId()
        val isCurrentConversation = _chatState.value.conversationId == event.conversationId
        val refreshMessages = event.action != "conversation_renamed" && event.action != "conversation_updated"

        if (event.action == "member_removed" && event.userId == currentUserId) {
            _notifications.tryEmit("Вас удалили из чата")
            if (isCurrentConversation) {
                closeConversation()
            } else {
                loadConversations(showLoading = false)
            }
            return
        }

        when (event.action) {
            "conversation_renamed" -> _notifications.tryEmit("Чат переименован")
            "member_added" -> {
                if (event.userId == currentUserId) {
                    _notifications.tryEmit("Вас добавили в чат")
                } else {
                    _notifications.tryEmit("В чат добавлен участник")
                }
            }
            "member_removed" -> _notifications.tryEmit("Состав чата обновлён")
            "member_role_updated" -> _notifications.tryEmit("Роль участника изменена")
            "ownership_transferred" -> {
                if (event.userId == currentUserId) {
                    _notifications.tryEmit("Вам передан ownership")
                } else {
                    _notifications.tryEmit("Ownership чата изменён")
                }
            }
        }

        loadConversations(showLoading = false)

        if (isCurrentConversation) {
            refreshConversationDetail(event.conversationId)
            if (refreshMessages) {
                viewModelScope.launch {
                    loadMessages(event.conversationId, initial = true, showLoading = false)
                }
            }
        }
    }

    private fun replaceMessage(updated: ChatMessage) {
        _chatState.update { state ->
            state.copy(
                messages = state.messages.map { if (it.id == updated.id) updated else it }
            )
        }
    }

    private fun createConversation(
        type: ConversationType,
        name: String?,
        memberUserIds: List<Long>,
    ) {
        _listState.update { it.copy(isCreatingConversation = true, error = null) }
        viewModelScope.launch {
            chatRepository.createConversation(
                type = type,
                name = name,
                taskId = null,
                memberUserIds = memberUserIds,
            ).fold(
                onSuccess = { conversationId ->
                    _listState.update { it.copy(isCreatingConversation = false) }
                    loadConversations(showLoading = false)
                    openConversation(conversationId)
                },
                onFailure = { e ->
                    _listState.update { it.copy(isCreatingConversation = false, error = e.message) }
                }
            )
        }
    }

    private fun currentConversationMember(): ConversationMember? {
        val currentUserId = preferences.getUserId()
        return _chatState.value.detail?.members?.firstOrNull { it.userId == currentUserId }
    }

    private fun reloadConversationState(
        conversationId: Long,
        activeManagementUserId: Long? = null,
    ) {
        _chatState.update {
            it.copy(
                isSavingConversation = false,
                activeManagementUserId = activeManagementUserId,
                error = null,
            )
        }
        openConversation(conversationId)
        loadConversations(showLoading = false)
    }

    private fun unreadCountForConversation(conversationId: Long): Int =
        _listState.value.conversations.firstOrNull { it.id == conversationId }?.unreadCount ?: 0

    private fun initialMessageLoadLimit(conversationId: Long): Int {
        val unreadCount = unreadCountForConversation(conversationId)
        if (unreadCount <= 0) return DEFAULT_MESSAGE_PAGE_SIZE

        return (unreadCount + 12)
            .coerceAtLeast(DEFAULT_MESSAGE_PAGE_SIZE)
            .coerceAtMost(MAX_INITIAL_MESSAGE_LOAD)
    }

    private fun isUnreadIncomingMessage(
        message: ChatMessage,
        currentUserId: Long,
        lastReadMessageId: Long?,
    ): Boolean {
        if (message.isDeleted || message.senderId == currentUserId) return false
        return lastReadMessageId == null || message.id > lastReadMessageId
    }

    private fun maybeResolveInitialUnreadAnchor(conversationId: Long) {
        if (!shouldResolveInitialUnreadAnchor || _chatState.value.conversationId != conversationId) return

        val unreadCount = unreadCountForConversation(conversationId)
        if (unreadCount <= 0) {
            shouldResolveInitialUnreadAnchor = false
            _chatState.update {
                it.copy(
                    pendingUnreadAnchorMessageId = null,
                    isPreparingUnreadAnchor = false,
                )
            }
            return
        }

        val detail = _chatState.value.detail ?: return
        val currentUserId = preferences.getUserId()
        val lastReadMessageId = detail.members
            .firstOrNull { it.userId == currentUserId }
            ?.lastReadMessageId
            ?: locallyReadMessageIds[conversationId]

        val unreadMessages = _chatState.value.messages
            .filter { message ->
                isUnreadIncomingMessage(
                    message = message,
                    currentUserId = currentUserId,
                    lastReadMessageId = lastReadMessageId,
                )
            }
            .sortedBy { it.id }

        if (
            unreadMessages.size < unreadCount &&
            _chatState.value.hasMore &&
            unreadAnchorLoadAttempts < MAX_UNREAD_PREFETCH_REQUESTS
        ) {
            if (unreadAnchorLoadJob?.isActive == true) return

            unreadAnchorLoadAttempts += 1
            unreadAnchorLoadJob = viewModelScope.launch {
                loadMessages(
                    conversationId = conversationId,
                    initial = false,
                    showLoading = false,
                    limit = UNREAD_PREFETCH_PAGE_SIZE,
                )
            }
            return
        }

        shouldResolveInitialUnreadAnchor = false
        _chatState.update {
            it.copy(
                pendingUnreadAnchorMessageId = unreadMessages.firstOrNull()?.id,
                isPreparingUnreadAnchor = unreadMessages.firstOrNull() != null,
            )
        }
    }

    private fun markConversationAsRead(conversationId: Long, latestMessageId: Long) {
        val knownReadMessageId = maxOf(
            locallyReadMessageIds[conversationId] ?: 0L,
            currentConversationMember()?.lastReadMessageId ?: 0L,
        )
        if (latestMessageId <= knownReadMessageId) {
            syncConversationReadState(conversationId, latestMessageId)
            return
        }

        viewModelScope.launch {
            chatRepository.markAsRead(conversationId, latestMessageId).fold(
                onSuccess = {
                    syncConversationReadState(conversationId, latestMessageId)
                },
                onFailure = { /* ignore read sync errors */ },
            )
        }
    }

    private fun syncConversationReadState(conversationId: Long, lastReadMessageId: Long) {
        val effectiveLastReadMessageId = maxOf(
            locallyReadMessageIds[conversationId] ?: 0L,
            lastReadMessageId,
        )
        locallyReadMessageIds[conversationId] = effectiveLastReadMessageId

        val currentUserId = preferences.getUserId()
        val remainingUnreadCount = _chatState.value.messages.count { message ->
            isUnreadIncomingMessage(
                message = message,
                currentUserId = currentUserId,
                lastReadMessageId = effectiveLastReadMessageId,
            )
        }

        _listState.update { state ->
            state.copy(
                conversations = state.conversations.map { conversation ->
                    if (conversation.id == conversationId) {
                        conversation.copy(unreadCount = remainingUnreadCount)
                    } else {
                        conversation
                    }
                }
            )
        }

        _chatState.update { state ->
            val detail = state.detail ?: return@update state
            state.copy(
                detail = detail.copy(
                    members = detail.members.map { member ->
                        if (member.userId == currentUserId) {
                            member.copy(
                                lastReadMessageId = maxOf(member.lastReadMessageId ?: 0L, effectiveLastReadMessageId)
                            )
                        } else {
                            member
                        }
                    }
                )
            )
        }
    }

    private fun handleTypingEvent(userId: Long?, conversationId: Long, isTyping: Boolean) {
        val currentConversationId = _chatState.value.conversationId ?: return
        val currentUserId = preferences.getUserId()
        if (userId == null || currentConversationId != conversationId || userId == currentUserId) return

        if (!isTyping) {
            removeTypingUser(userId)
            return
        }

        val name = _chatState.value.detail?.members
            ?.firstOrNull { it.userId == userId }
            ?.fullName
            ?.takeIf { it.isNotBlank() }
            ?: _chatState.value.detail?.members
                ?.firstOrNull { it.userId == userId }
                ?.username
                ?.takeIf { it.isNotBlank() }
            ?: "#$userId"

        _chatState.update { state ->
            state.copy(typingUsers = state.typingUsers + (userId to name))
        }

        typingTimeoutJobs[userId]?.cancel()
        typingTimeoutJobs[userId] = viewModelScope.launch {
            delay(TYPING_TIMEOUT_MS + 1_000L)
            removeTypingUser(userId)
        }
    }

    private fun handleReadEvent(userId: Long?, conversationId: Long, messageId: Long?) {
        val currentConversationId = _chatState.value.conversationId ?: return
        val currentUserId = preferences.getUserId()
        if (userId == null || messageId == null || currentConversationId != conversationId || userId == currentUserId) {
            return
        }

        _chatState.update { state ->
            val previous = state.readReceipts[userId]
            val nextValue = if (previous == null) messageId else maxOf(previous, messageId)
            state.copy(readReceipts = state.readReceipts + (userId to nextValue))
        }
    }

    private fun removeTypingUser(userId: Long) {
        typingTimeoutJobs.remove(userId)?.cancel()
        _chatState.update { state ->
            if (!state.typingUsers.containsKey(userId)) {
                state
            } else {
                state.copy(typingUsers = state.typingUsers - userId)
            }
        }
    }

    private fun clearTypingUsers() {
        typingTimeoutJobs.values.forEach { it.cancel() }
        typingTimeoutJobs.clear()
        _chatState.update { it.copy(typingUsers = emptyMap()) }
    }

    private fun sendTypingStopped() {
        localTypingResetJob?.cancel()
        localTypingResetJob = null

        val conversationId = _chatState.value.conversationId
        if (sentTypingActive && conversationId != null) {
            chatRepository.sendTypingIndicator(conversationId, false)
        }
        sentTypingActive = false
    }

    companion object {
        private const val TYPING_TIMEOUT_MS = 3_000L
        private const val DEFAULT_MESSAGE_PAGE_SIZE = 30
        private const val UNREAD_PREFETCH_PAGE_SIZE = 80
        private const val MAX_INITIAL_MESSAGE_LOAD = 160
        private const val MAX_UNREAD_PREFETCH_REQUESTS = 8
    }
}

data class AttachmentOpenEvent(
    val uri: Uri,
    val mimeType: String,
    val fileName: String,
)
