package com.fieldworker.ui.chat

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import com.fieldworker.ui.chat.components.ChatAvatar
import com.fieldworker.ui.chat.components.swipeToReply
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import com.fieldworker.domain.model.ChatAttachment
import com.fieldworker.domain.model.ConversationDetail
import com.fieldworker.domain.model.ConversationMember
import com.fieldworker.domain.model.ChatMessage
import com.fieldworker.domain.model.ChatReaction
import com.fieldworker.domain.model.ConversationType
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskReference
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.domain.model.User
import java.util.Locale
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch
import okhttp3.Headers
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.fieldworker.ui.chat.components.BubbleShape

/**
 * Экран чата — список сообщений с полем ввода.
 * Поддерживает ответы, реакции, удаление, подгрузку истории.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    title: String,
    conversationDetail: ConversationDetail?,
    messages: List<ChatMessage>,
    hasMore: Boolean,
    pendingUnreadAnchorMessageId: Long?,
    isPreparingUnreadAnchor: Boolean,
    lastReadMessageId: Long?,
    isLoadingMessages: Boolean,
    isSending: Boolean,
    replyTo: ChatMessage?,
    typingText: String?,
    readReceipts: Map<Long, Long>,
    messageSendStatuses: Map<Long, ChatSendStatus> = emptyMap(),
    messageSendErrors: Map<Long, String> = emptyMap(),
    pinnedMessageIds: Set<Long> = emptySet(),
    recipientCount: Int,
    availableUsers: List<User>,
    isLoadingUsers: Boolean,
    baseUrl: String,
    authToken: String?,
    isMuted: Boolean,
    isArchived: Boolean,
    isSavingConversation: Boolean,
    activeManagementUserId: Long?,
    currentUserId: Long,
    currentUsername: String? = null,
    currentUserFullName: String? = null,
    onBack: () -> Unit,
    onLoadUsers: (Boolean) -> Unit,
    onToggleMute: () -> Unit,
    onToggleArchive: () -> Unit,
    onRenameConversation: (String) -> Unit,
    onAddMembers: (List<Long>) -> Unit,
    onRemoveMember: (Long) -> Unit,
    onUpdateMemberRole: (Long, String) -> Unit,
    onTransferOwnership: (Long) -> Unit,
    onSendMessage: (String) -> Unit,
    onAttachFile: () -> Unit,
    onCancelAttachment: () -> Unit = {},
    pendingAttachmentUri: android.net.Uri? = null,
    onMessageInputChanged: (String) -> Unit,
    onLoadMore: () -> Unit,
    onDeleteMessage: (Long) -> Unit,
    onRetryMessage: (Long) -> Unit = {},
    onTogglePinnedMessage: (Long) -> Unit = {},
    onToggleReaction: (Long, String) -> Unit,
    onSetReplyTo: (ChatMessage?) -> Unit,
    onOpenAttachment: (ChatAttachment) -> Unit,
    onVisibleMessagesRead: (Long) -> Unit,
    onUnreadAnchorConsumed: () -> Unit,
    availableTasks: List<Task> = emptyList(),
    pendingAttachedTask: TaskReference? = null,
    onAttachTask: (Task) -> Unit = {},
    onCancelAttachedTask: () -> Unit = {},
    onOpenTask: (Long) -> Unit = {},
) {
    val coroutineScope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val timelineItems = remember(messages, currentUserId, lastReadMessageId) {
        buildChatTimelineItems(
            messages = messages,
            currentUserId = currentUserId,
            lastReadMessageId = lastReadMessageId,
        )
    }
    val conversationType = conversationDetail?.type
    val senderAvatarUrls = remember(conversationDetail?.members) {
        conversationDetail?.members
            ?.associate { member -> member.userId to member.avatarUrl }
            .orEmpty()
    }
    val sortedReadReceiptIds = remember(readReceipts) {
        readReceipts.values.sorted()
    }
    val readCountsByMessageId = remember(messages, sortedReadReceiptIds) {
        buildMap<Long, Int>(messages.size) {
            messages.forEach { message ->
                val firstReadIndex = sortedReadReceiptIds.lowerBound(message.id)
                put(message.id, sortedReadReceiptIds.size - firstReadIndex)
            }
        }
    }
    val headerSubtitle = remember(conversationDetail, recipientCount, isMuted, isArchived) {
        when (conversationType) {
            ConversationType.GROUP -> buildString {
                append("${conversationDetail.members.size} участников")
                if (isMuted) append(" · без звука")
                if (isArchived) append(" · архив")
            }
            ConversationType.TASK -> buildString {
                append("Чат по заявке")
                if (isMuted) append(" · без звука")
                if (isArchived) append(" · архив")
            }
            ConversationType.ORG_GENERAL -> buildString {
                append("Общий чат организации")
                if (isMuted) append(" · без звука")
                if (isArchived) append(" · архив")
            }
            else -> buildString {
                append("Личный чат")
                if (isMuted) append(" · без звука")
                if (isArchived) append(" · архив")
            }
        }
    }

    // Для sticky date separator
    val firstVisibleItemIndex = listState.firstVisibleItemIndex
    val stickyDate = remember(firstVisibleItemIndex, timelineItems) {
        timelineItems
            .drop(firstVisibleItemIndex)
            .firstNotNullOfOrNull { item ->
                when (item) {
                    is ChatTimelineItem.DateSeparator -> item.label
                    is ChatTimelineItem.MessageEntry -> item.message.createdAt.format(systemMessageFormatter)
                    is ChatTimelineItem.UnreadSeparator -> null
                }
            }
    }
    val imageAttachments = remember(messages) {
        messages
            .asReversed()
            .flatMap { message -> message.attachments }
            .filter { attachment -> attachment.isImage }
            .distinctBy { attachment -> attachment.id }
    }
    val imageAttachmentMessageIds = remember(messages) {
        buildMap<Long, Long> {
            messages.forEach { message ->
                message.attachments.forEach { attachment ->
                    if (attachment.isImage) {
                        put(attachment.id, message.id)
                    }
                }
            }
        }
    }
    var showConversationMenu by remember { mutableStateOf(false) }
    var showManagementDialog by remember { mutableStateOf(false) }
    var showMessageSearch by remember { mutableStateOf(false) }
    var messageSearchQuery by remember { mutableStateOf("") }
    var searchResultIndex by remember { mutableStateOf(0) }
    var previewAttachmentId by remember { mutableStateOf<Long?>(null) }
    var highlightedMessageId by remember { mutableStateOf<Long?>(null) }
    val pinnedMessages = remember(messages, pinnedMessageIds) {
        messages.filter { it.id in pinnedMessageIds }.sortedByDescending { it.createdAt }
    }
    val messageSearchResults = remember(messages, messageSearchQuery) {
        val query = messageSearchQuery.trim().lowercase()
        if (query.isBlank()) {
            emptyList()
        } else {
            messages
                .filter { !it.isDeleted && it.text.orEmpty().lowercase().contains(query) }
                .sortedByDescending { it.createdAt }
        }
    }
    val previewAttachmentIndex = remember(previewAttachmentId, imageAttachments) {
        previewAttachmentId?.let { selectedId ->
            imageAttachments.indexOfFirst { attachment -> attachment.id == selectedId }
        } ?: -1
    }
    val previewAttachment = if (previewAttachmentIndex >= 0) {
        imageAttachments[previewAttachmentIndex]
    } else {
        null
    }

    LaunchedEffect(highlightedMessageId) {
        val targetId = highlightedMessageId ?: return@LaunchedEffect
        delay(2200)
        if (highlightedMessageId == targetId) {
            highlightedMessageId = null
        }
    }

    LaunchedEffect(messageSearchResults) {
        searchResultIndex = 0
    }

    // Load more when approaching the end (messages are newest-first)
    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisibleItem = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val totalItems = listState.layoutInfo.totalItemsCount
            hasMore && !isLoadingMessages && totalItems > 0 && lastVisibleItem >= totalItems - 5
        }
    }
    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) onLoadMore()
    }

    LaunchedEffect(pendingUnreadAnchorMessageId, timelineItems) {
        val targetMessageId = pendingUnreadAnchorMessageId ?: return@LaunchedEffect
        val targetIndex = timelineItems.indexOfFirst { item ->
            item is ChatTimelineItem.MessageEntry && item.message.id == targetMessageId
        }
        if (targetIndex >= 0) {
            listState.scrollToItem(targetIndex)
            highlightedMessageId = targetMessageId
            onUnreadAnchorConsumed()
        }
    }

    // Auto-scroll to bottom when a new message is sent or received
    val latestMessageId = messages.firstOrNull()?.id
    LaunchedEffect(latestMessageId) {
        if (latestMessageId != null && !isLoadingMessages) {
            listState.animateScrollToItem(0)
        }
    }

    LaunchedEffect(timelineItems, currentUserId, lastReadMessageId, isPreparingUnreadAnchor) {
        snapshotFlow {
            if (isPreparingUnreadAnchor) {
                null
            } else {
                val effectiveLastReadMessageId = lastReadMessageId ?: 0L
                listState.layoutInfo.visibleItemsInfo
                    .mapNotNull { itemInfo ->
                        (timelineItems.getOrNull(itemInfo.index) as? ChatTimelineItem.MessageEntry)?.message
                    }
                    .filter { message ->
                        !message.isDeleted &&
                            message.senderId != currentUserId &&
                            message.id > effectiveLastReadMessageId
                    }
                    .maxOfOrNull { it.id }
            }
        }
            .filterNotNull()
            .distinctUntilChanged()
            .collect { visibleMessageId ->
                onVisibleMessagesRead(visibleMessageId)
            }
    }

    val colorScheme = MaterialTheme.colorScheme
    val chatWallpaperBrush = remember(colorScheme) {
        chatWallpaperBrush(colorScheme)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(chatWallpaperBrush)
            .chatWallpaperPattern(
                backgroundColor = colorScheme.background,
                primaryColor = colorScheme.primary,
                secondaryColor = colorScheme.onSurfaceVariant,
            )
    ) {
        Scaffold(
            containerColor = Color.Transparent,
        topBar = {
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    tonalElevation = 0.dp,
                    shadowElevation = 0.dp,
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .statusBarsPadding(),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 4.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            IconButton(onClick = onBack) {
                                Icon(
                                    Icons.AutoMirrored.Filled.ArrowBack,
                                    contentDescription = "Назад",
                                    tint = MaterialTheme.colorScheme.onSurface,
                                )
                            }

                            val isGroup = conversationType == ConversationType.GROUP
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(10.dp))
                                    .then(
                                        if (isGroup) Modifier.clickable {
                                            showManagementDialog = true
                                            onLoadUsers(false)
                                        } else Modifier
                                    )
                                    .padding(horizontal = 6.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                ChatAvatar(
                                    name = title,
                                    id = conversationDetail?.id,
                                    type = conversationType ?: ConversationType.DIRECT,
                                    avatarUrl = conversationDetail?.avatarUrl,
                                    baseUrl = baseUrl,
                                    authToken = authToken,
                                    size = 38,
                                )

                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = title,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        text = headerSubtitle,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }

                            Box {
                                IconButton(onClick = { showConversationMenu = true }) {
                                    Icon(Icons.Default.MoreVert, contentDescription = "Действия чата")
                                }
                                DropdownMenu(
                                    expanded = showConversationMenu,
                                    onDismissRequest = { showConversationMenu = false },
                                ) {
                                    if (conversationDetail?.type == ConversationType.GROUP) {
                                        DropdownMenuItem(
                                            text = { Text("Управление группой") },
                                            onClick = {
                                                showConversationMenu = false
                                                showManagementDialog = true
                                                onLoadUsers(false)
                                            },
                                        )
                                    }
                                    DropdownMenuItem(
                                        text = { Text("Поиск в чате") },
                                        onClick = {
                                            showConversationMenu = false
                                            showMessageSearch = true
                                        },
                                    )
                                    DropdownMenuItem(
                                        text = { Text(if (isMuted) "Включить уведомления" else "Отключить уведомления") },
                                        onClick = {
                                            showConversationMenu = false
                                            onToggleMute()
                                        },
                                    )
                                    DropdownMenuItem(
                                        text = { Text(if (isArchived) "Вернуть из архива" else "Архивировать чат") },
                                        onClick = {
                                            showConversationMenu = false
                                            onToggleArchive()
                                        },
                                    )
                                }
                            }
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
                        AnimatedVisibility(visible = showMessageSearch) {
                            ChatSearchBar(
                                query = messageSearchQuery,
                                resultCount = messageSearchResults.size,
                                currentIndex = searchResultIndex,
                                onQueryChange = { messageSearchQuery = it },
                                onPrevious = {
                                    if (messageSearchResults.isNotEmpty()) {
                                        searchResultIndex = (searchResultIndex + 1).coerceAtMost(messageSearchResults.lastIndex)
                                        val targetId = messageSearchResults[searchResultIndex].id
                                        highlightedMessageId = targetId
                                        coroutineScope.launch {
                                            scrollToMessage(timelineItems, listState, targetId)
                                        }
                                    }
                                },
                                onNext = {
                                    if (messageSearchResults.isNotEmpty()) {
                                        searchResultIndex = (searchResultIndex - 1).coerceAtLeast(0)
                                        val targetId = messageSearchResults[searchResultIndex].id
                                        highlightedMessageId = targetId
                                        coroutineScope.launch {
                                            scrollToMessage(timelineItems, listState, targetId)
                                        }
                                    }
                                },
                                onClose = {
                                    showMessageSearch = false
                                    messageSearchQuery = ""
                                },
                            )
                        }
                        if (pinnedMessages.isNotEmpty()) {
                            PinnedMessagesBar(
                                pinnedMessages = pinnedMessages,
                                onMessageClick = { messageId ->
                                    highlightedMessageId = messageId
                                    coroutineScope.launch {
                                        scrollToMessage(timelineItems, listState, messageId)
                                    }
                                },
                                onUnpin = onTogglePinnedMessage,
                            )
                        }
                    }
                }
            },
            bottomBar = {
                ChatInputBar(
                    replyTo = replyTo,
                    typingText = typingText,
                    isSending = isSending,
                    availableUsers = availableUsers,
                    pendingAttachmentUri = pendingAttachmentUri,
                    onSend = onSendMessage,
                    onAttachFile = onAttachFile,
                    onCancelAttachment = onCancelAttachment,
                    onTextChanged = onMessageInputChanged,
                    onCancelReply = { onSetReplyTo(null) },
                    pendingAttachedTask = pendingAttachedTask,
                    availableTasks = availableTasks,
                    onAttachTask = onAttachTask,
                    onCancelAttachedTask = onCancelAttachedTask,
                )
            },
            floatingActionButton = {
                val showFab = listState.firstVisibleItemIndex > 8
                AnimatedVisibility(
                    visible = showFab,
                    enter = fadeIn() + scaleIn(initialScale = 0.82f),
                    exit = fadeOut() + scaleOut(targetScale = 0.82f)
                ) {
                    FloatingActionButton(
                        onClick = {
                            coroutineScope.launch {
                                listState.animateScrollToItem(0)
                            }
                        },
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ) {
                        Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Вниз")
                    }
                }
            }
        ) { padding ->
            Box(modifier = Modifier.fillMaxSize()) {
                if (timelineItems.isEmpty() && !isLoadingMessages) {
                    EmptyChatState(
                        conversationType = conversationType,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(padding),
                    )
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(padding),
                        reverseLayout = true,
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(0.dp),
                    ) {
                        items(
                            items = timelineItems,
                            key = {
                                when (it) {
                                    is ChatTimelineItem.DateSeparator -> it.key
                                    is ChatTimelineItem.UnreadSeparator -> it.key
                                    is ChatTimelineItem.MessageEntry -> "message-${it.message.id}"
                                }
                            },
                            contentType = {
                                when (it) {
                                    is ChatTimelineItem.DateSeparator -> "date_separator"
                                    is ChatTimelineItem.UnreadSeparator -> "unread_separator"
                                    is ChatTimelineItem.MessageEntry -> "message_entry"
                                }
                            }
                        ) { item ->
                            when (item) {
                                is ChatTimelineItem.DateSeparator -> {
                                    DateSeparatorChip(label = item.label)
                                }

                                is ChatTimelineItem.UnreadSeparator -> {
                                    UnreadSeparatorChip(count = item.count)
                                }

                                is ChatTimelineItem.MessageEntry -> {
                                    val message = item.message
                                    val readCount = readCountsByMessageId[message.id] ?: 0
                                    val sendStatus = messageSendStatuses[message.id]?.let { status ->
                                        if (status == ChatSendStatus.SENT && readCount > 0) ChatSendStatus.READ else status
                                    } ?: if (message.senderId == currentUserId && readCount > 0) {
                                        ChatSendStatus.READ
                                    } else if (message.senderId == currentUserId) {
                                        ChatSendStatus.SENT
                                    } else {
                                        null
                                    }
                                    val senderAvatarUrl = senderAvatarUrls[message.senderId]
                                    val isOwnMessage = (currentUserId > 0 && message.senderId == currentUserId) ||
                                        (!currentUsername.isNullOrBlank() && message.senderName == currentUsername) ||
                                        (!currentUserFullName.isNullOrBlank() && message.senderName == currentUserFullName)
                                    MessageBubble(
                                        message = message,
                                        isHighlighted = highlightedMessageId == message.id,
                                        isPinned = message.id in pinnedMessageIds,
                                        isOwn = isOwnMessage,
                                        conversationType = conversationType,
                                        groupedWithPrevious = item.groupedWithPrevious,
                                        groupedWithNext = item.groupedWithNext,
                                        senderAvatarUrl = senderAvatarUrl,
                                        readCount = readCount,
                                        recipientCount = recipientCount,
                                        sendStatus = sendStatus,
                                        sendError = messageSendErrors[message.id],
                                        currentUserId = currentUserId,
                                        onReply = { onSetReplyTo(message) },
                                        onDelete = { onDeleteMessage(message.id) },
                                        onRetry = { onRetryMessage(message.id) },
                                        onTogglePinned = { onTogglePinnedMessage(message.id) },
                                        onToggleReaction = { emoji -> onToggleReaction(message.id, emoji) },
                                        baseUrl = baseUrl,
                                        authToken = authToken,
                                        onPreviewAttachment = { previewAttachmentId = it.id },
                                        onOpenAttachment = onOpenAttachment,
                                        onOpenTask = onOpenTask,
                                    )
                                }
                            }
                        }
                        if (isLoadingMessages) {
                            item {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                }
                            }
                        }
                    }
                }
                AnimatedVisibility(
                    visible = stickyDate != null && timelineItems.size > 5,
                    enter = fadeIn() + scaleIn(initialScale = 0.9f),
                    exit = fadeOut() + scaleOut(targetScale = 0.9f),
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 10.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
                        tonalElevation = 2.dp,
                        shadowElevation = 1.dp,
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.70f)
                        ),
                    ) {
                        Text(
                            text = stickyDate.orEmpty(),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 7.dp)
                        )
                    }
                }
            }
        }
    }
    if (showManagementDialog && conversationDetail != null && conversationDetail.type == ConversationType.GROUP) {
        GroupManagementDialog(
            conversationDetail = conversationDetail,
            currentUserId = currentUserId,
            users = availableUsers,
            isLoadingUsers = isLoadingUsers,
            isSavingConversation = isSavingConversation,
            activeManagementUserId = activeManagementUserId,
            onDismiss = { showManagementDialog = false },
            onRefreshUsers = { onLoadUsers(true) },
            onRenameConversation = onRenameConversation,
            onAddMembers = onAddMembers,
            onRemoveMember = onRemoveMember,
            onUpdateMemberRole = onUpdateMemberRole,
            onTransferOwnership = onTransferOwnership,
        )
    }

    previewAttachment?.let { attachment ->
        ImagePreviewDialog(
            attachment = attachment,
            galleryAttachments = imageAttachments,
            currentIndex = previewAttachmentIndex,
            totalCount = imageAttachments.size,
            hasPrevious = previewAttachmentIndex > 0,
            hasNext = previewAttachmentIndex in 0 until imageAttachments.lastIndex,
            baseUrl = baseUrl,
            authToken = authToken,
            onDismiss = { previewAttachmentId = null },
            onJumpToMessage = {
                val targetMessageId = imageAttachmentMessageIds[attachment.id] ?: return@ImagePreviewDialog
                previewAttachmentId = null
                highlightedMessageId = targetMessageId
                val targetIndex = timelineItems.indexOfFirst { item ->
                    item is ChatTimelineItem.MessageEntry && item.message.id == targetMessageId
                }
                if (targetIndex >= 0) {
                    coroutineScope.launch {
                        listState.animateScrollToItem(targetIndex)
                    }
                }
            },
            onSelectAttachment = { selectedAttachment ->
                previewAttachmentId = selectedAttachment.id
            },
            onShowPrevious = {
                if (previewAttachmentIndex > 0) {
                    previewAttachmentId = imageAttachments[previewAttachmentIndex - 1].id
                }
            },
            onShowNext = {
                if (previewAttachmentIndex in 0 until imageAttachments.lastIndex) {
                    previewAttachmentId = imageAttachments[previewAttachmentIndex + 1].id
                }
            },
            onOpenAttachment = {
                previewAttachmentId = null
                onOpenAttachment(attachment)
            },
        )
    }
}

@Composable
private fun DateSeparatorChip(label: String) {
    val useTelegramLightStyle = MaterialTheme.colorScheme.usesTelegramLightChatStyle()
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label.uppercase(),
            modifier = Modifier
                .background(
                    color = if (useTelegramLightStyle) Color(0x40FFFFFF)
                    else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                    shape = RoundedCornerShape(999.dp),
                )
                .padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall.copy(
                letterSpacing = 0.6.sp,
                fontWeight = FontWeight.Medium,
            ),
            color = if (useTelegramLightStyle) Color(0xFF5F787A)
            else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun UnreadSeparatorChip(count: Int) {
    val useTelegramLightStyle = MaterialTheme.colorScheme.usesTelegramLightChatStyle()
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(999.dp),
            color = if (useTelegramLightStyle) Color(0xB8E2F3EE) else MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.7f),
            tonalElevation = 0.dp,
            shadowElevation = 0.dp,
            border = androidx.compose.foundation.BorderStroke(
                width = 1.dp,
                color = if (useTelegramLightStyle) Color(0x6AB7CEC8) else MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
            ),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "Непрочитанные",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (useTelegramLightStyle) Color(0xFF547072) else MaterialTheme.colorScheme.onPrimaryContainer,
                )
                Badge(
                    containerColor = if (useTelegramLightStyle) Color(0xFF56A4D9) else MaterialTheme.colorScheme.primary,
                    contentColor = Color.White,
                ) {
                    Text(
                        text = if (count > 99) "99+" else count.toString(),
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun ChatSearchBar(
    query: String,
    resultCount: Int,
    currentIndex: Int,
    onQueryChange: (String) -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onClose: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.weight(1f),
            singleLine = true,
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            placeholder = { Text("Поиск сообщений") },
            supportingText = {
                if (query.isNotBlank()) {
                    Text(
                        text = if (resultCount == 0) {
                            "Нет совпадений"
                        } else {
                            "${currentIndex + 1} из $resultCount"
                        }
                    )
                }
            },
        )
        IconButton(onClick = onPrevious, enabled = resultCount > 0) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Предыдущее")
        }
        IconButton(onClick = onNext, enabled = resultCount > 0) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Следующее")
        }
        IconButton(onClick = onClose) {
            Icon(Icons.Default.Close, contentDescription = "Закрыть поиск")
        }
    }
}

@Composable
private fun PinnedMessagesBar(
    pinnedMessages: List<ChatMessage>,
    onMessageClick: (Long) -> Unit,
    onUnpin: (Long) -> Unit,
) {
    val current = pinnedMessages.firstOrNull() ?: return
    val label = if (pinnedMessages.size > 1)
        "Закреплённое сообщение · ${pinnedMessages.size}"
    else "Закреплённое сообщение"

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onMessageClick(current.id) }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .width(3.dp)
                        .height(34.dp)
                        .background(
                            MaterialTheme.colorScheme.primary,
                            RoundedCornerShape(2.dp),
                        ),
                )
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = current.text?.takeIf { it.isNotBlank() } ?: "Вложение",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                IconButton(onClick = { onUnpin(current.id) }) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = "Открепить",
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            HorizontalDivider(
                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
            )
        }
    }
}

@Composable
private fun HeaderTag(
    text: String,
    containerColor: Color,
    contentColor: Color,
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = containerColor,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            contentColor.copy(alpha = 0.14f)
        ),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = contentColor,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
        )
    }
}

@Composable
private fun ConversationMemberStrip(
    members: List<ConversationMember>,
    overflowCount: Int,
    baseUrl: String,
    authToken: String?,
) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.72f),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f),
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                members.forEach { member ->
                    ChatAvatar(
                        name = member.fullName,
                        id = member.userId,
                        type = ConversationType.DIRECT,
                        avatarUrl = member.avatarUrl,
                        baseUrl = baseUrl,
                        authToken = authToken,
                        size = 28,
                    )
                }
                if (overflowCount > 0) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.primaryContainer,
                    ) {
                        Box(
                            modifier = Modifier.size(28.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "+$overflowCount",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                            )
                        }
                    }
                }
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Участники",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = members.joinToString { it.fullName.substringBefore(' ') },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun EmptyChatState(
    conversationType: ConversationType?,
    modifier: Modifier = Modifier,
) {
    val title = when (conversationType) {
        ConversationType.GROUP -> "Группа готова к обсуждению"
        ConversationType.TASK -> "Переписка по заявке пуста"
        ConversationType.ORG_GENERAL -> "Оргчат ждет первое сообщение"
        else -> "Начните диалог"
    }
    val description = when (conversationType) {
        ConversationType.GROUP -> "Поделитесь контекстом, закрепите договоренности и держите команду в одном потоке."
        ConversationType.TASK -> "Оставьте первое сообщение, чтобы зафиксировать детали работ и договоренности."
        ConversationType.ORG_GENERAL -> "Здесь можно быстро синхронизировать коллег по общим вопросам организации."
        else -> "Отправьте первое сообщение, чтобы разговор начался."
    }

    Box(
        modifier = modifier.padding(horizontal = 24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.90f),
            border = androidx.compose.foundation.BorderStroke(
                1.dp,
                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
            ),
        ) {
            Box(
                modifier = Modifier.background(
                    Brush.linearGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.surface.copy(alpha = 0.98f),
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.06f),
                            MaterialTheme.colorScheme.tertiary.copy(alpha = 0.06f),
                        )
                    )
                )
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 22.dp, vertical = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                    ) {
                        Text(
                            text = "Новый старт",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        )
                    }
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

private fun senderAccentColor(senderId: Long): Color {
    val palette = listOf(
        Color(0xFFCC4E92),
        Color(0xFF1E93D4),
        Color(0xFF49A95B),
        Color(0xFF7A68EE),
        Color(0xFFE0802E),
        Color(0xFF0F9AA9),
    )
    // Защита от отрицательного или нулевого senderId
    if (senderId <= 0) {
        return palette[0]
    }
    val index = (senderId % palette.size).toInt()
    return palette[index]
}

private suspend fun scrollToMessage(
    timelineItems: List<ChatTimelineItem>,
    listState: LazyListState,
    messageId: Long,
) {
    val targetIndex = timelineItems.indexOfFirst { item ->
        item is ChatTimelineItem.MessageEntry && item.message.id == messageId
    }
    if (targetIndex >= 0) {
        listState.animateScrollToItem(targetIndex)
    }
}

private fun Modifier.chatWallpaperPattern(
    backgroundColor: Color,
    primaryColor: Color,
    secondaryColor: Color,
): Modifier = drawWithCache {
    val useTelegramLightStyle = backgroundColor.luminance() > 0.7f
    val patternPrimary = if (useTelegramLightStyle) {
        Color(0xFF76A968).copy(alpha = 0.07f)
    } else {
        primaryColor.copy(alpha = 0.035f)
    }
    val patternSecondary = if (useTelegramLightStyle) {
        Color(0xFF5D9771).copy(alpha = 0.06f)
    } else {
        secondaryColor.copy(alpha = 0.03f)
    }
    val spacing = if (useTelegramLightStyle) 140.dp.toPx() else 160.dp.toPx()
    val symbol = if (useTelegramLightStyle) 8.dp.toPx() else 9.dp.toPx()
    val stroke = 0.8.dp.toPx()
    val cols = (size.width / spacing).toInt() + 2
    val rows = (size.height / spacing).toInt() + 2
    val primaryStrokePath = Path()
    val secondaryStrokePath = Path()

    for (row in 0 until rows) {
        for (col in 0 until cols) {
            val shiftX = if (row % 2 == 0) spacing * 0.5f else 0f
            val center = Offset(
                x = (col * spacing) + shiftX - (spacing * 0.2f),
                y = (row * spacing) + symbol,
            )
            if ((row + col) % 2 == 0) {
                primaryStrokePath.addOval(
                    Rect(
                        left = center.x - symbol,
                        top = center.y - symbol,
                        right = center.x + symbol,
                        bottom = center.y + symbol,
                    )
                )
            } else {
                secondaryStrokePath.moveTo(center.x - symbol, center.y - symbol)
                secondaryStrokePath.lineTo(center.x + symbol, center.y + symbol)
                secondaryStrokePath.moveTo(center.x + symbol, center.y - symbol)
                secondaryStrokePath.lineTo(center.x - symbol, center.y + symbol)
            }
        }
    }

    onDrawBehind {
        drawPath(primaryStrokePath, color = patternPrimary, style = Stroke(width = stroke))
        drawPath(secondaryStrokePath, color = patternSecondary, style = Stroke(width = stroke))
    }
}

@Composable
private fun MessageMetaRow(
    modifier: Modifier = Modifier,
    isOwn: Boolean,
    isEdited: Boolean,
    createdAt: LocalDateTime,
    bubbleMetaColor: Color,
    readCount: Int,
    recipientCount: Int,
    sendStatus: ChatSendStatus? = null,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isEdited) {
            Text(
                text = "ред.",
                style = MaterialTheme.typography.labelSmall,
                color = bubbleMetaColor,
            )
        }
        Text(
            text = createdAt.format(timeOnlyFormatter),
            style = MaterialTheme.typography.labelSmall,
            color = bubbleMetaColor,
        )
        if (isOwn) {
            if (sendStatus == ChatSendStatus.SENDING) {
                Text(
                    text = "отпр.",
                    style = MaterialTheme.typography.labelSmall,
                    color = bubbleMetaColor,
                )
                return@Row
            }
            if (sendStatus == ChatSendStatus.FAILED) {
                Text(
                    text = "ошибка",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
                return@Row
            }
            val isRead = readCount > 0
            val checkColor = if (isRead) Color(0xFF4A90E2) else bubbleMetaColor
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Done,
                    contentDescription = "Отправлено",
                    tint = checkColor,
                    modifier = Modifier.size(12.dp)
                )
                if (isRead) {
                    Icon(
                        imageVector = Icons.Default.Done,
                        contentDescription = "Прочитано",
                        tint = checkColor,
                        modifier = Modifier.size(12.dp).offset(x = (-5).dp)
                    )
                }
            }
        }
    }
}

// ============================================================================
// Task picker dialog (выбор заявки для прикрепления)
// ============================================================================

@Composable
private fun TaskPickerDialog(
    tasks: List<Task>,
    onDismiss: () -> Unit,
    onSelect: (Task) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(query, tasks) {
        val q = query.trim().lowercase()
        if (q.isBlank()) {
            tasks.take(50)
        } else {
            tasks.filter { task ->
                task.title.lowercase().contains(q) ||
                    task.address.lowercase().contains(q) ||
                    (task.taskNumber.lowercase().contains(q))
            }.take(50)
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 4.dp,
            modifier = Modifier.fillMaxWidth().heightIn(max = 560.dp),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Прикрепить заявку",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Поиск по номеру, заголовку, адресу") },
                    singleLine = true,
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                if (filtered.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "Заявки не найдены",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    LazyColumn(modifier = Modifier.weight(1f, fill = false)) {
                        items(filtered, key = { it.id }) { task ->
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onSelect(task) }
                                    .padding(vertical = 10.dp),
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    if (task.taskNumber.isNotBlank()) {
                                        Text(
                                            text = "№${task.taskNumber}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.padding(end = 6.dp),
                                        )
                                    }
                                    Text(
                                        text = task.title,
                                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                Text(
                                    text = listOf(
                                        task.status.displayName,
                                        task.priority.displayName,
                                        task.address,
                                    ).joinToString(" · "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                        }
                    }
                }
            }
        }
    }
}

// ============================================================================
// Task reference card (прикреплённая заявка)
// ============================================================================

@Composable
private fun TaskReferenceCard(
    taskRef: TaskReference,
    isOwn: Boolean,
    bubbleTextColor: Color,
    onClick: () -> Unit,
) {
    val accent = if (isOwn) bubbleTextColor.copy(alpha = 0.85f) else MaterialTheme.colorScheme.primary
    val container = if (isOwn) {
        MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.12f)
    } else {
        MaterialTheme.colorScheme.surface.copy(alpha = 0.6f)
    }

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = container,
        border = androidx.compose.foundation.BorderStroke(
            width = 1.dp,
            color = accent.copy(alpha = 0.35f),
        ),
        modifier = Modifier
            .fillMaxWidth()
            .then(if (taskRef.accessible) Modifier.clickable(onClick = onClick) else Modifier),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = "📋", modifier = Modifier.padding(end = 8.dp))
            if (!taskRef.accessible) {
                Text(
                    text = "Заявка недоступна",
                    style = MaterialTheme.typography.bodySmall,
                    color = bubbleTextColor.copy(alpha = 0.7f),
                )
            } else {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        taskRef.taskNumber?.let { num ->
                            Text(
                                text = "№$num",
                                style = MaterialTheme.typography.labelSmall,
                                color = bubbleTextColor.copy(alpha = 0.7f),
                                modifier = Modifier.padding(end = 6.dp),
                            )
                        }
                        Text(
                            text = taskRef.title ?: "Заявка",
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = bubbleTextColor,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                    }
                    val statusLabel = taskRef.status?.let { TaskStatus.fromString(it).displayName }
                    val priorityLabel = taskRef.priority?.let { Priority.fromString(it).displayName }
                    val meta = listOfNotNull(statusLabel, priorityLabel, taskRef.rawAddress)
                        .joinToString(" · ")
                    if (meta.isNotBlank()) {
                        Text(
                            text = meta,
                            style = MaterialTheme.typography.bodySmall,
                            color = bubbleTextColor.copy(alpha = 0.7f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

// ============================================================================
// Message Bubble
// ============================================================================

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(
    message: ChatMessage,
    isHighlighted: Boolean,
    isPinned: Boolean,
    isOwn: Boolean,
    conversationType: ConversationType?,
    groupedWithPrevious: Boolean,
    groupedWithNext: Boolean,
    senderAvatarUrl: String?,
    readCount: Int,
    recipientCount: Int,
    sendStatus: ChatSendStatus?,
    sendError: String?,
    currentUserId: Long,
    onReply: () -> Unit,
    onDelete: () -> Unit,
    onRetry: () -> Unit,
    onTogglePinned: () -> Unit,
    onToggleReaction: (String) -> Unit,
    baseUrl: String,
    authToken: String?,
    onPreviewAttachment: (ChatAttachment) -> Unit,
    onOpenAttachment: (ChatAttachment) -> Unit,
    onOpenTask: (Long) -> Unit = {},
) {
    val context = LocalContext.current
    var showMenu by remember { mutableStateOf(false) }

    // System messages
    if (message.isSystem) {
        val eventMeta = resolveChatSystemEventMeta(message.text)

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 6.dp, horizontal = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Surface(
                shape = RoundedCornerShape(16.dp),
                tonalElevation = 1.dp,
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.8f),
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = eventMeta.title,
                        style = MaterialTheme.typography.labelSmall,
                        color = eventMeta.accentColor(MaterialTheme.colorScheme),
                    )
                    Text(
                        text = message.text ?: "",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontStyle = FontStyle.Italic,
                    )
                    Text(
                        text = message.createdAt.format(systemMessageFormatter),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                    )
                }
            }
        }
        return
    }

    // Deleted messages
    if (message.isDeleted) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 2.dp),
            contentAlignment = if (isOwn) Alignment.CenterEnd else Alignment.CenterStart,
        ) {
            Text(
                text = "Сообщение удалено",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontStyle = FontStyle.Italic,
            )
        }
        return
    }

    var swipeProgress by remember(message.id) { mutableStateOf(0f) }
    val highlightAlpha by animateFloatAsState(
        targetValue = if (isHighlighted) 0.45f else 0f,
        animationSpec = spring(dampingRatio = 0.9f, stiffness = 560f),
        label = "messageHighlightAlpha",
    )
    val replyHintScale = 0.86f + (swipeProgress * 0.14f)
    val replyHintColor = MaterialTheme.colorScheme.primaryContainer.copy(
        alpha = 0.30f + (swipeProgress * 0.28f)
    )
    val colorScheme = MaterialTheme.colorScheme
    val useTelegramLightStyle = colorScheme.usesTelegramLightChatStyle()
    val reserveAvatarSlot = !isOwn && conversationType != ConversationType.DIRECT
    val showAvatar = reserveAvatarSlot && !groupedWithNext
    val senderAccent = senderAccentColor(message.senderId)
    val bubbleShape = BubbleShape(isOwn = isOwn, groupedWithNext = groupedWithNext)
    val bubbleStartPadding = if (!isOwn && !groupedWithPrevious) 14.dp else 12.dp
    val bubbleEndPadding = if (isOwn && !groupedWithNext) 14.dp else 12.dp
    val bubbleTextColor = if (isOwn) {
        if (useTelegramLightStyle) Color(0xFF223124) else colorScheme.onPrimaryContainer
    } else {
        if (useTelegramLightStyle) Color(0xFF1F2428) else colorScheme.onSurface
    }
    val bubbleMetaColor = if (isOwn) {
        if (useTelegramLightStyle) Color(0xFF8AA08D) else colorScheme.onPrimaryContainer.copy(alpha = 0.55f)
    } else {
        if (useTelegramLightStyle) Color(0xFF9CA8AE) else colorScheme.onSurfaceVariant.copy(alpha = 0.55f)
    }
    val bubbleContainerColor = if (isOwn) {
        if (useTelegramLightStyle) Color(0xFFE4F7C7) else colorScheme.primaryContainer.copy(alpha = 0.84f)
    } else {
        if (useTelegramLightStyle) Color(0xFFFEFEFD) else colorScheme.surface
    }
    val canInlineMeta = !message.text.isNullOrBlank() &&
        message.attachments.isEmpty() &&
        message.replyTo == null &&
        !message.text.contains('\n') &&
        message.text.length <= if (isOwn) 28 else 34
    val hasOnlyImageAttachments = message.text.isNullOrBlank() &&
        message.replyTo == null &&
        message.attachments.isNotEmpty() &&
        message.attachments.all { it.isImage }
    val topGap = if (groupedWithPrevious) 1.dp else 3.dp
    val bottomGap = if (groupedWithNext) 1.dp else if (message.reactions.isNotEmpty()) 0.dp else 3.dp
    val reactionOverlap = 6.dp
    val copyableMessageText = message.text?.takeIf { it.isNotBlank() }
    val quickReactionEmojis = listOf(
        "\uD83D\uDC4D",
        "\u2764\uFE0F",
        "\uD83D\uDE02",
        "\uD83D\uDE2E",
        "\uD83D\uDE22",
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 2.dp, end = 2.dp, top = topGap, bottom = bottomGap)
            .then(
                if (!isOwn) {
                    Modifier.swipeToReply(
                        enabled = true,
                        onProgressChanged = { swipeProgress = it },
                        onReply = onReply,
                    )
                } else {
                    Modifier
                }
            ),
        verticalAlignment = Alignment.Top,
    ) {
        // Аватар отправителя (только для групповых и чужих сообщений)
        AnimatedVisibility(
            visible = !isOwn && swipeProgress > 0.02f,
            enter = fadeIn() + scaleIn(initialScale = 0.82f),
            exit = fadeOut() + scaleOut(targetScale = 0.82f),
        ) {
            Surface(
                shape = CircleShape,
                color = replyHintColor,
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                ),
                modifier = Modifier
                    .padding(end = 6.dp, top = 4.dp)
                    .size(28.dp)
                    .graphicsLayer {
                        scaleX = replyHintScale
                        scaleY = replyHintScale
                    },
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
        }

        if (reserveAvatarSlot) {
            Box(
                modifier = Modifier
                    .width(36.dp)
                    .padding(top = 6.dp),
                contentAlignment = Alignment.BottomStart,
            ) {
                if (showAvatar) {
                    ChatAvatar(
                        name = message.senderName,
                        id = message.senderId,
                        type = ConversationType.DIRECT,
                        avatarUrl = senderAvatarUrl,
                        baseUrl = baseUrl,
                        authToken = authToken,
                        size = 30,
                    )
                }
            }
            Spacer(Modifier.width(6.dp))
        }
        Column(
            modifier = Modifier.weight(1f),
            horizontalAlignment = if (isOwn) Alignment.End else Alignment.Start,
        ) {
            Column(
                horizontalAlignment = if (isOwn) Alignment.End else Alignment.Start,
            ) {
                Box(
                    modifier = Modifier
                        .background(
                            color = MaterialTheme.colorScheme.primary.copy(alpha = highlightAlpha * 0.16f),
                            shape = RoundedCornerShape(26.dp),
                        )
                        .padding(horizontal = if (isHighlighted) 4.dp else 0.dp, vertical = if (isHighlighted) 3.dp else 0.dp)
                ) {
                    Surface(
                        shape = bubbleShape,
                        color = bubbleContainerColor,
                        tonalElevation = 0.dp,
                        shadowElevation = if (useTelegramLightStyle) 1.2.dp else if (isOwn) 0.dp else 1.dp,
                        border = if (isHighlighted) {
                            androidx.compose.foundation.BorderStroke(
                                1.dp,
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.24f),
                            )
                        } else if (useTelegramLightStyle) {
                            androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (isOwn) Color(0x80CAE8AF) else Color(0x66E1E6E6),
                            )
                        } else {
                            null
                        },
                        modifier = Modifier
                            .widthIn(min = 0.dp, max = 300.dp)
                            .combinedClickable(
                                onClick = {},
                                onLongClick = { showMenu = true },
                            ),
                    ) {
                        Column(
                            modifier = if (hasOnlyImageAttachments) {
                                Modifier.fillMaxWidth()
                            } else {
                                Modifier.padding(
                                    start = bubbleStartPadding,
                                    top = 8.dp,
                                    end = bubbleEndPadding,
                                    bottom = 8.dp,
                                )
                            }
                        ) {
                if (hasOnlyImageAttachments) {
                    message.attachments.forEachIndexed { index, attachment ->
                        val isLastImage = index == message.attachments.lastIndex
                        Box(modifier = Modifier.fillMaxWidth()) {
                            PhotoMessageAttachment(
                                attachment = attachment,
                                baseUrl = baseUrl,
                                authToken = authToken,
                                hasRoundedBottom = isLastImage,
                                onPreview = { onPreviewAttachment(attachment) },
                            )
                            // Имя отправителя — на первом фото (входящие в группе).
                            if (index == 0 && !isOwn && !groupedWithPrevious) {
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.TopStart)
                                        .padding(8.dp)
                                        .background(Color(0x73000000), RoundedCornerShape(999.dp))
                                        .padding(horizontal = 8.dp, vertical = 3.dp),
                                ) {
                                    Text(
                                        text = message.senderName ?: "",
                                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                                        color = Color.White,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                            // Время + галочки — поверх нижнего угла последнего фото.
                            if (isLastImage) {
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.BottomEnd)
                                        .padding(8.dp)
                                        .background(Color(0x8A000000), RoundedCornerShape(999.dp))
                                        .padding(horizontal = 8.dp, vertical = 3.dp),
                                ) {
                                    MessageMetaRow(
                                        isOwn = isOwn,
                                        isEdited = message.isEdited,
                                        createdAt = message.createdAt,
                                        bubbleMetaColor = Color.White,
                                        readCount = readCount,
                                        recipientCount = recipientCount,
                                    )
                                }
                            }
                        }
                    }
                } else {
                // Sender name (for group chats, not own messages)
                if (!isOwn && !groupedWithPrevious) {
                    Text(
                        text = message.senderName ?: "???",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                        color = senderAccent,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(3.dp))
                }

                // Reply preview
                message.replyTo?.let { reply ->
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = if (isOwn) {
                            if (useTelegramLightStyle) Color(0xA7D6EBBB) else MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.12f)
                        } else {
                            if (useTelegramLightStyle) Color(0xFFF3F5F6) else MaterialTheme.colorScheme.surface.copy(alpha = 0.55f)
                        },
                        border = androidx.compose.foundation.BorderStroke(
                            width = 1.dp,
                            color = if (useTelegramLightStyle) Color(0x66D5DCDE) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.22f),
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 6.dp),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .width(4.dp)
                                    .height(32.dp)
                                    .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(2.dp))
                            )
                            Spacer(Modifier.width(8.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = reply.senderName ?: "",
                                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                                    color = senderAccent,
                                )
                                Text(
                                    text = reply.text ?: "",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = bubbleTextColor,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }

                // Attached task card
                message.attachedTask?.let { taskRef ->
                    TaskReferenceCard(
                        taskRef = taskRef,
                        isOwn = isOwn,
                        bubbleTextColor = bubbleTextColor,
                        onClick = { onOpenTask(taskRef.id) },
                    )
                    if (!message.text.isNullOrBlank()) Spacer(Modifier.height(6.dp))
                }

                if (!message.text.isNullOrBlank()) {
                    if (canInlineMeta) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.Bottom,
                        ) {
                            Text(
                                text = message.text,
                                style = MaterialTheme.typography.bodyMedium,
                                color = bubbleTextColor,
                                maxLines = 1,
                            )
                            MessageMetaRow(
                                modifier = Modifier.padding(bottom = 1.dp),
                                isOwn = isOwn,
                                isEdited = message.isEdited,
                                createdAt = message.createdAt,
                                bubbleMetaColor = bubbleMetaColor,
                                readCount = readCount,
                                recipientCount = recipientCount,
                                sendStatus = sendStatus,
                            )
                        }
                    } else {
                        Text(
                            text = message.text,
                            style = MaterialTheme.typography.bodyMedium,
                            color = bubbleTextColor,
                        )
                    }
                }

                if (message.attachments.isNotEmpty()) {
                    Column(
                        modifier = Modifier.padding(top = if (message.text.isNullOrBlank()) 0.dp else 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        message.attachments.forEach { attachment ->
                            AttachmentCard(
                                attachment = attachment,
                                isOwn = isOwn,
                                baseUrl = baseUrl,
                                authToken = authToken,
                                onPreview = { onPreviewAttachment(attachment) },
                                onOpen = { onOpenAttachment(attachment) },
                            )
                        }
                    }
                }

                if (!canInlineMeta) {
                    Spacer(Modifier.height(4.dp))
                    MessageMetaRow(
                        modifier = Modifier.align(Alignment.End),
                        isOwn = isOwn,
                        isEdited = message.isEdited,
                        createdAt = message.createdAt,
                        bubbleMetaColor = bubbleMetaColor,
                        readCount = readCount,
                        recipientCount = recipientCount,
                        sendStatus = sendStatus,
                    )
                }
                }
                        }
                    }
                }
                if (message.reactions.isNotEmpty()) {
                    ReactionSummaryBubble(
                        reactions = message.reactions,
                        currentUserId = currentUserId,
                        modifier = Modifier
                            .align(Alignment.Start)
                            .offset(y = -reactionOverlap)
                            .padding(start = 10.dp),
                        onToggleReaction = onToggleReaction,
                    )
                }
                if (sendStatus == ChatSendStatus.FAILED) {
                    Row(
                        modifier = Modifier.padding(top = 4.dp, end = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = sendError ?: "Не отправлено",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.error,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        TextButton(onClick = onRetry) {
                            Text("Повторить")
                        }
                    }
                }
            }

        // Context menu
        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            modifier = Modifier.widthIn(min = 220.dp, max = 260.dp),
        ) {
            // Quick reactions row (Telegram-style)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                quickReactionEmojis.forEach { emoji ->
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .clickable {
                                showMenu = false
                                onToggleReaction(emoji)
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(emoji, style = MaterialTheme.typography.titleMedium)
                    }
                }
            }
            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 8.dp),
                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f),
            )
            DropdownMenuItem(
                text = { Text("Ответить") },
                onClick = {
                    showMenu = false
                    onReply()
                },
            )
            if (copyableMessageText != null) {
                DropdownMenuItem(
                    text = { Text("Копировать") },
                    onClick = {
                        showMenu = false
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("chat_message", copyableMessageText))
                        Toast.makeText(context, "Сообщение скопировано", Toast.LENGTH_SHORT).show()
                    },
                )
            }
            DropdownMenuItem(
                text = { Text(if (isPinned) "Открепить" else "Закрепить") },
                onClick = {
                    showMenu = false
                    onTogglePinned()
                },
            )
            if (isOwn) {
                DropdownMenuItem(
                    text = {
                        Text(
                            "Удалить",
                            color = MaterialTheme.colorScheme.error,
                        )
                    },
                    onClick = {
                        showMenu = false
                        onDelete()
                    },
                )
            }
        }
}
}
}


@Composable
private fun PhotoMessageAttachment(
    attachment: ChatAttachment,
    baseUrl: String,
    authToken: String?,
    hasRoundedBottom: Boolean,
    onPreview: () -> Unit,
) {
    val context = LocalContext.current
    val previewRequest = rememberAttachmentImageRequest(
        context = context,
        baseUrl = baseUrl,
        authToken = authToken,
        attachment = attachment,
    )
    val imageShape = if (hasRoundedBottom) {
        RoundedCornerShape(bottomStart = 14.dp, bottomEnd = 14.dp)
    } else {
        RoundedCornerShape(0.dp)
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(188.dp)
            .clip(imageShape)
            .clickable(onClick = onPreview),
    ) {
        AsyncImage(
            model = previewRequest,
            contentDescription = attachment.fileName,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun AttachmentCard(
    attachment: ChatAttachment,
    isOwn: Boolean,
    baseUrl: String,
    authToken: String?,
    onPreview: () -> Unit,
    onOpen: () -> Unit,
) {
    val context = LocalContext.current
    val containerColor = if (isOwn) {
        MaterialTheme.colorScheme.surface.copy(alpha = 0.18f)
    } else {
        MaterialTheme.colorScheme.surface
    }
    val label = if (attachment.isImage) "Изображение" else "Файл"
    val previewRequest = rememberAttachmentImageRequest(
        context = context,
        baseUrl = baseUrl,
        authToken = authToken,
        attachment = attachment,
    )

    if (attachment.isImage) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(188.dp)
                .clip(RoundedCornerShape(18.dp))
                .clickable(onClick = onPreview),
        ) {
            AsyncImage(
                model = previewRequest,
                contentDescription = attachment.fileName,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        return
    }

    Surface(
        onClick = if (attachment.isImage) onPreview else onOpen,
        shape = RoundedCornerShape(20.dp),
        color = containerColor,
        tonalElevation = if (isOwn) 1.dp else 2.dp,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f)
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (attachment.isImage) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .clickable(onClick = onPreview),
                ) {
                    AsyncImage(
                        model = previewRequest,
                        contentDescription = attachment.fileName,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .align(Alignment.BottomCenter)
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(Color.Transparent, Color(0xAA000000))
                                )
                            )
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = label,
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White,
                            )
                            Text(
                                text = attachment.fileName,
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color.White,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = MaterialTheme.colorScheme.primaryContainer,
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
                Text(
                    text = formatAttachmentSize(attachment.fileSize),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (!attachment.isImage) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                            shape = RoundedCornerShape(14.dp),
                        )
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.70f),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.padding(10.dp),
                        )
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = attachment.fileName,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "Нажмите, чтобы открыть файл",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    TextButton(onClick = onOpen) {
                        Text("Открыть")
                    }
                }
            } else {
                Text(
                    text = "Нажмите на превью для полного просмотра",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                TextButton(onClick = onOpen, modifier = Modifier.align(Alignment.End)) {
                    Text("Открыть как файл")
                }
            }
            }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ImagePreviewDialog(
    attachment: ChatAttachment,
    galleryAttachments: List<ChatAttachment>,
    currentIndex: Int,
    totalCount: Int,
    hasPrevious: Boolean,
    hasNext: Boolean,
    baseUrl: String,
    authToken: String?,
    onDismiss: () -> Unit,
    onJumpToMessage: () -> Unit,
    onSelectAttachment: (ChatAttachment) -> Unit,
    onShowPrevious: () -> Unit,
    onShowNext: () -> Unit,
    onOpenAttachment: () -> Unit,
) {
    val context = LocalContext.current
    val imageRequest = rememberAttachmentImageRequest(
        context = context,
        baseUrl = baseUrl,
        authToken = authToken,
        attachment = attachment,
    )
    var scale by remember(attachment.id) { mutableStateOf(1f) }
    var offsetX by remember(attachment.id) { mutableStateOf(0f) }
    var offsetY by remember(attachment.id) { mutableStateOf(0f) }
    var horizontalSwipeDistance by remember(attachment.id) { mutableStateOf(0f) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize(),
            color = MaterialTheme.colorScheme.scrim.copy(alpha = 0.96f),
            tonalElevation = 0.dp,
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                AsyncImage(
                    model = imageRequest,
                    contentDescription = attachment.fileName,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 12.dp, vertical = 64.dp)
                        .graphicsLayer(
                            scaleX = scale,
                            scaleY = scale,
                            translationX = offsetX,
                            translationY = offsetY,
                        )
                        .pointerInput(attachment.id) {
                            detectTransformGestures { _, pan, zoom, _ ->
                                val nextScale = (scale * zoom).coerceIn(1f, 5f)
                                scale = nextScale
                                if (nextScale > 1f) {
                                    offsetX += pan.x
                                    offsetY += pan.y
                                } else {
                                    offsetX = 0f
                                    offsetY = 0f
                                }
                            }
                        }
                        .pointerInput(attachment.id) {
                            detectTapGestures(
                                onDoubleTap = {
                                    if (scale > 1f) {
                                        scale = 1f
                                        offsetX = 0f
                                        offsetY = 0f
                                    } else {
                                        scale = 2f
                                    }
                                },
                            )
                        }
                        .pointerInput(attachment.id, hasPrevious, hasNext) {
                            detectHorizontalDragGestures(
                                onHorizontalDrag = { _, dragAmount ->
                                    if (scale <= 1f) {
                                        horizontalSwipeDistance += dragAmount
                                    }
                                },
                                onDragEnd = {
                                    if (scale <= 1f) {
                                        when {
                                            horizontalSwipeDistance <= -96f && hasNext -> onShowNext()
                                            horizontalSwipeDistance >= 96f && hasPrevious -> onShowPrevious()
                                        }
                                    }
                                    horizontalSwipeDistance = 0f
                                },
                                onDragCancel = {
                                    horizontalSwipeDistance = 0f
                                },
                            )
                        },
                )

                if (hasPrevious) {
                    FilledIconButton(
                        onClick = onShowPrevious,
                        modifier = Modifier
                            .align(Alignment.CenterStart)
                            .padding(start = 12.dp),
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.82f),
                            contentColor = MaterialTheme.colorScheme.onSurface,
                        ),
                    ) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Предыдущее изображение")
                    }
                }

                if (hasNext) {
                    FilledIconButton(
                        onClick = onShowNext,
                        modifier = Modifier
                            .align(Alignment.CenterEnd)
                            .padding(end = 12.dp),
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.82f),
                            contentColor = MaterialTheme.colorScheme.onSurface,
                        ),
                    ) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Следующее изображение")
                    }
                }

                Row(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onJumpToMessage) {
                        Text("К сообщению")
                    }
                    TextButton(onClick = onOpenAttachment) {
                        Text("Открыть")
                    }
                    FilledIconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Закрыть")
                    }
                }

                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = attachment.fileName,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onPrimary,
                        textAlign = TextAlign.Center,
                    )
                    if (totalCount > 1 && currentIndex >= 0) {
                        Text(
                            text = "${currentIndex + 1} из $totalCount",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.82f),
                        )
                    }
                    Text(
                        text = formatAttachmentSize(attachment.fileSize),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f),
                    )
                    Text(
                        text = if (scale > 1f) {
                            "Масштаб ${(scale * 100).toInt()}% • двойной тап для сброса"
                        } else {
                            "Щипок для увеличения • свайп влево/вправо для перехода • двойной тап для быстрого зума"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.72f),
                        textAlign = TextAlign.Center,
                    )

                    if (galleryAttachments.size > 1) {
                        LazyRow(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp),
                        ) {
                            items(galleryAttachments, key = { item -> item.id }) { galleryAttachment ->
                                val thumbnailRequest = rememberAttachmentImageRequest(
                                    context = context,
                                    baseUrl = baseUrl,
                                    authToken = authToken,
                                    attachment = galleryAttachment,
                                )
                                val isSelected = galleryAttachment.id == attachment.id

                                Surface(
                                    onClick = {
                                        if (galleryAttachment.id != attachment.id) {
                                            onSelectAttachment(galleryAttachment)
                                        }
                                    },
                                    shape = RoundedCornerShape(12.dp),
                                    border = androidx.compose.foundation.BorderStroke(
                                        width = if (isSelected) 2.dp else 1.dp,
                                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.25f),
                                    ),
                                    color = MaterialTheme.colorScheme.surface.copy(alpha = if (isSelected) 0.2f else 0.08f),
                                ) {
                                    AsyncImage(
                                        model = thumbnailRequest,
                                        contentDescription = galleryAttachment.fileName,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .size(width = 72.dp, height = 56.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun formatAttachmentSize(size: Long): String {
    if (size < 1024) return "$size Б"
    if (size < 1024 * 1024) return String.format(Locale.getDefault(), "%.1f КБ", size / 1024f)
    return String.format(Locale.getDefault(), "%.1f МБ", size / (1024f * 1024f))
}

private fun buildAttachmentPreviewUrl(baseUrl: String, attachment: ChatAttachment): String {
    val normalizedBaseUrl = baseUrl.trimEnd('/')
    return if (!attachment.thumbnailPath.isNullOrBlank()) {
        "$normalizedBaseUrl/api/chat/attachments/${attachment.id}/thumbnail"
    } else {
        "$normalizedBaseUrl/api/chat/attachments/${attachment.id}/download"
    }
}

@Composable
private fun rememberAttachmentImageRequest(
    context: android.content.Context,
    baseUrl: String,
    authToken: String?,
    attachment: ChatAttachment,
): ImageRequest {
    return remember(baseUrl, authToken, attachment.id, attachment.thumbnailPath, attachment.filePath) {
        buildAttachmentImageRequest(
            context = context,
            baseUrl = baseUrl,
            authToken = authToken,
            attachment = attachment,
        )
    }
}

private fun buildAttachmentImageRequest(
    context: android.content.Context,
    baseUrl: String,
    authToken: String?,
    attachment: ChatAttachment,
): ImageRequest {
    val requestBuilder = ImageRequest.Builder(context)
        .data(buildAttachmentPreviewUrl(baseUrl, attachment))
        .crossfade(false)

    if (!authToken.isNullOrBlank()) {
        requestBuilder.headers(
            Headers.Builder()
                .add("Authorization", "Bearer $authToken")
                .build()
        )
    }

    return requestBuilder.build()
}

// ============================================================================
// Reaction Bubble
// ============================================================================

@Composable
private fun ReactionSummaryBubble(
    reactions: List<ChatReaction>,
    currentUserId: Long,
    modifier: Modifier = Modifier,
    onToggleReaction: (String) -> Unit,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        reactions.forEach { reaction ->
            ReactionSummaryItem(
                reaction = reaction,
                isSelected = reaction.isReactedBy(currentUserId),
                onClick = { onToggleReaction(reaction.emoji) },
            )
        }
    }
}

@Composable
private fun ReactionSummaryItem(
    reaction: ChatReaction,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val useTelegramLightStyle = MaterialTheme.colorScheme.usesTelegramLightChatStyle()
    val containerColor = when {
        isSelected && useTelegramLightStyle -> Color(0xCCCFE9AF)
        isSelected -> MaterialTheme.colorScheme.primaryContainer
        useTelegramLightStyle -> Color(0xCCFFFFFF)
        else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.8f)
    }
    val contentColor = when {
        isSelected && useTelegramLightStyle -> Color(0xFF345F32)
        isSelected -> MaterialTheme.colorScheme.onPrimaryContainer
        useTelegramLightStyle -> Color(0xFF54707A)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(containerColor)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(reaction.emoji, fontSize = 13.sp)
        if (reaction.count > 1) {
            Text(
                text = "${reaction.count}",
                style = MaterialTheme.typography.labelSmall,
                color = contentColor,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

// ============================================================================
// Chat Input Bar
// ============================================================================

@Composable
private fun ChatInputBar(
    replyTo: ChatMessage?,
    typingText: String?,
    isSending: Boolean,
    availableUsers: List<User>,
    pendingAttachmentUri: android.net.Uri? = null,
    onSend: (String) -> Unit,
    onAttachFile: () -> Unit,
    onCancelAttachment: () -> Unit = {},
    onTextChanged: (String) -> Unit,
    onCancelReply: () -> Unit,
    pendingAttachedTask: TaskReference? = null,
    availableTasks: List<Task> = emptyList(),
    onAttachTask: (Task) -> Unit = {},
    onCancelAttachedTask: () -> Unit = {},
) {
    var text by remember { mutableStateOf("") }
    var showTaskPicker by remember { mutableStateOf(false) }
    var attachMenuOpen by remember { mutableStateOf(false) }

    if (showTaskPicker) {
        TaskPickerDialog(
            tasks = availableTasks,
            onDismiss = { showTaskPicker = false },
            onSelect = {
                onAttachTask(it)
                showTaskPicker = false
            },
        )
    }
    val mentionQuery = remember(text) {
        Regex("""(?:^|\s)@([\p{L}\p{N}_-]*)$""").find(text)?.groupValues?.getOrNull(1).orEmpty()
    }
    val showMentionSuggestions = text.endsWith("@") || Regex("""(?:^|\s)@[\p{L}\p{N}_-]+$""").containsMatchIn(text)
    val mentionSuggestions = remember(availableUsers, mentionQuery, showMentionSuggestions) {
        if (!showMentionSuggestions) {
            emptyList()
        } else {
            val query = mentionQuery.lowercase()
            availableUsers
                .filter { user ->
                    val name = user.fullName.lowercase()
                    val username = user.username.lowercase()
                    query.isBlank() || name.contains(query) || username.contains(query)
                }
                .take(5)
        }
    }
    val useTelegramLightStyle = MaterialTheme.colorScheme.usesTelegramLightChatStyle()
    val canSend = remember(text, pendingAttachmentUri, pendingAttachedTask) {
        text.trim().isNotEmpty() || pendingAttachmentUri != null || pendingAttachedTask != null
    }
    val sendButtonScale by animateFloatAsState(
        targetValue = if (canSend && !isSending) 1f else 0.9f,
        animationSpec = spring(dampingRatio = 0.72f, stiffness = 520f),
        label = "chatSendButtonScale",
    )
    val sendButtonContainerColor by animateColorAsState(
        targetValue = if (canSend) {
            MaterialTheme.colorScheme.primary
        } else {
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f)
        },
        label = "chatSendButtonContainer",
    )
    val sendButtonContentColor by animateColorAsState(
        targetValue = if (canSend) {
            MaterialTheme.colorScheme.onPrimary
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        },
        label = "chatSendButtonContent",
    )

    Surface(
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
        color = if (useTelegramLightStyle) Color(0xDFF4F7EE) else MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier
                .navigationBarsPadding(),
        ) {
            HorizontalDivider(
                color = if (useTelegramLightStyle) Color(0x66C8D6C7) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
            )
            Column(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
            AnimatedVisibility(
                    visible = !typingText.isNullOrBlank(),
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically(),
                ) {
                    Text(
                        text = typingText.orEmpty(),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                        fontStyle = FontStyle.Italic,
                        modifier = Modifier.padding(horizontal = 6.dp),
                    )
                }

            AnimatedVisibility(
                    visible = mentionSuggestions.isNotEmpty(),
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically(),
                ) {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(horizontal = 4.dp),
                    ) {
                        items(mentionSuggestions, key = { it.id }) { user ->
                            AssistChip(
                                onClick = {
                                    text = text.replace(
                                        Regex("""(?:^|\s)@[\p{L}\p{N}_-]*$"""),
                                        " @${user.username} "
                                    ).trimStart()
                                    onTextChanged(text)
                                },
                                label = { Text(user.getDisplayName(), maxLines = 1) },
                            )
                        }
                    }
                }

            AnimatedVisibility(
                    visible = pendingAttachmentUri != null,
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically(),
                ) {
                    pendingAttachmentUri?.let { uri ->
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = if (useTelegramLightStyle) Color(0xFFF3F5F6)
                            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (useTelegramLightStyle) Color(0x66D4DCDD)
                                else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                            ),
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                coil.compose.AsyncImage(
                                    model = uri,
                                    contentDescription = "Прикреплённое изображение",
                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                    modifier = Modifier
                                        .size(48.dp)
                                        .clip(RoundedCornerShape(10.dp)),
                                )
                                Text(
                                    text = "Изображение готово к отправке",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.weight(1f),
                                )
                                IconButton(
                                    onClick = onCancelAttachment,
                                    modifier = Modifier.size(28.dp),
                                ) {
                                    Icon(
                                        Icons.Default.Close,
                                        contentDescription = "Удалить",
                                        modifier = Modifier.size(16.dp),
                                    )
                                }
                            }
                        }
                    }
                }

            AnimatedVisibility(
                    visible = pendingAttachedTask != null,
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically(),
                ) {
                    pendingAttachedTask?.let { task ->
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f),
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.35f),
                            ),
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Text(text = "📋")
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "Заявка",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.SemiBold,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                    Text(
                                        text = listOfNotNull(
                                            task.taskNumber?.let { "№$it" },
                                            task.title,
                                        ).joinToString(" · "),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                IconButton(onClick = onCancelAttachedTask, modifier = Modifier.size(28.dp)) {
                                    Icon(Icons.Default.Close, contentDescription = "Убрать заявку", modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }

            AnimatedVisibility(
                    visible = replyTo != null,
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically(),
                ) {
                    replyTo?.let { safeReply ->
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = if (useTelegramLightStyle) Color(0xFFF3F5F6) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (useTelegramLightStyle) Color(0x66D4DCDD) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                            ),
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .width(3.dp)
                                        .height(30.dp)
                                        .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(2.dp))
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = safeReply.senderName ?: "",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.SemiBold,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                    Text(
                                        text = safeReply.text ?: "",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                IconButton(onClick = onCancelReply, modifier = Modifier.size(28.dp)) {
                                    Icon(Icons.Default.Close, contentDescription = "Отменить", modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Surface(
                    shape = RoundedCornerShape(24.dp),
                    color = if (useTelegramLightStyle) Color(0xF4FFFFFF) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.44f),
                    border = androidx.compose.foundation.BorderStroke(
                        width = 1.dp,
                        color = if (useTelegramLightStyle) Color(0x66D1DAD8) else Color.Transparent,
                    ),
                    modifier = Modifier.weight(1f),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 4.dp, end = 8.dp, top = 2.dp, bottom = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box {
                            IconButton(
                                onClick = { attachMenuOpen = true },
                                enabled = !isSending,
                                modifier = Modifier.size(40.dp),
                            ) {
                                Icon(
                                    Icons.Default.Add,
                                    contentDescription = "Прикрепить",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            DropdownMenu(
                                expanded = attachMenuOpen,
                                onDismissRequest = { attachMenuOpen = false },
                            ) {
                                DropdownMenuItem(
                                    text = { Text("Файл") },
                                    onClick = {
                                        attachMenuOpen = false
                                        onAttachFile()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Заявка") },
                                    onClick = {
                                        attachMenuOpen = false
                                        showTaskPicker = true
                                    },
                                )
                            }
                        }
                        BasicTextField(
                            value = text,
                            onValueChange = {
                                text = it
                                onTextChanged(it)
                            },
                            modifier = Modifier.weight(1f),
                            textStyle = MaterialTheme.typography.bodyLarge.copy(
                                color = MaterialTheme.colorScheme.onSurface,
                            ),
                            minLines = 1,
                            maxLines = 5,
                            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                            decorationBox = { innerTextField ->
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .defaultMinSize(minHeight = 40.dp)
                                        .padding(end = 4.dp, top = 8.dp, bottom = 8.dp),
                                    contentAlignment = Alignment.CenterStart,
                                ) {
                                    if (text.isBlank()) {
                                        Text(
                                            text = if (replyTo != null) "Напишите ответ..." else "Сообщение",
                                            style = MaterialTheme.typography.bodyLarge,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    innerTextField()
                                }
                            },
                        )
                    }
                }

                FilledIconButton(
                    onClick = {
                        if (canSend) {
                            onSend(text.trim())
                            text = ""
                            onTextChanged("")
                        }
                    },
                    enabled = canSend && !isSending,
                    shape = CircleShape,
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = sendButtonContainerColor,
                        contentColor = sendButtonContentColor,
                        disabledContainerColor = sendButtonContainerColor,
                        disabledContentColor = sendButtonContentColor,
                    ),
                    modifier = Modifier
                        .size(48.dp)
                        .graphicsLayer {
                            scaleX = sendButtonScale
                            scaleY = sendButtonScale
                        },
                ) {
                    if (isSending) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = sendButtonContentColor,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(
                            Icons.AutoMirrored.Filled.Send,
                            contentDescription = "Отправить",
                        )
                    }
                }
            }
        }
        }
    }
}

private fun ColorScheme.usesTelegramLightChatStyle(): Boolean = background.luminance() > 0.7f

private fun chatWallpaperBrush(colorScheme: ColorScheme): Brush {
    return if (colorScheme.usesTelegramLightChatStyle()) {
        Brush.linearGradient(
            colors = listOf(
                Color(0xFFE6EDB6),
                Color(0xFFC7DFAE),
                Color(0xFFF0E7BE),
            )
        )
    } else {
        Brush.verticalGradient(
            colors = listOf(
                colorScheme.background,
                colorScheme.surface,
                colorScheme.background,
            )
        )
    }
}

private fun List<Long>.lowerBound(target: Long): Int {
    var low = 0
    var high = size
    while (low < high) {
        val mid = (low + high) ushr 1
        if (this[mid] < target) {
            low = mid + 1
        } else {
            high = mid
        }
    }
    return low
}

private val timeOnlyFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val systemMessageFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM HH:mm")
