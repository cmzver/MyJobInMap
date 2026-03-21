package com.fieldworker.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.animateContentSize
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
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import com.fieldworker.domain.model.ChatAttachment
import com.fieldworker.domain.model.ConversationDetail
import com.fieldworker.domain.model.ConversationMember
import com.fieldworker.domain.model.ChatMessage
import com.fieldworker.domain.model.ChatReaction
import com.fieldworker.domain.model.ConversationType
import com.fieldworker.domain.model.User
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
    onMessageInputChanged: (String) -> Unit,
    onLoadMore: () -> Unit,
    onDeleteMessage: (Long) -> Unit,
    onToggleReaction: (Long, String) -> Unit,
    onSetReplyTo: (ChatMessage?) -> Unit,
    onOpenAttachment: (ChatAttachment) -> Unit,
    onVisibleMessagesRead: (Long) -> Unit,
    onUnreadAnchorConsumed: () -> Unit,
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
    var previewAttachmentId by remember { mutableStateOf<Long?>(null) }
    var highlightedMessageId by remember { mutableStateOf<Long?>(null) }
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
            onUnreadAnchorConsumed()
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
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            FilledTonalIconButton(
                                onClick = onBack,
                                modifier = Modifier.size(40.dp),
                                colors = IconButtonDefaults.filledTonalIconButtonColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f),
                                    contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                ),
                            ) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                            }

                            ChatAvatar(
                                name = title,
                                id = conversationDetail?.id,
                                type = conversationType ?: ConversationType.DIRECT,
                                avatarUrl = conversationDetail?.avatarUrl,
                                baseUrl = baseUrl,
                                authToken = authToken,
                                size = 42,
                            )

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = title,
                                    style = MaterialTheme.typography.titleLarge,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = headerSubtitle,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
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
                    }
                }
            },
            bottomBar = {
                ChatInputBar(
                    replyTo = replyTo,
                    typingText = typingText,
                    isSending = isSending,
                    onSend = onSendMessage,
                    onAttachFile = onAttachFile,
                    onTextChanged = onMessageInputChanged,
                    onCancelReply = { onSetReplyTo(null) },
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
                                    val readCount = readReceipts.values.count { it >= message.id }
                                    val senderAvatarUrl = conversationDetail?.members
                                        ?.firstOrNull { it.userId == message.senderId }
                                        ?.avatarUrl
                                    AnimatedMessageEntry(
                                        messageId = message.id,
                                        isOwn = message.senderId == currentUserId,
                                    ) {
                                        MessageBubble(
                                            message = message,
                                            isHighlighted = highlightedMessageId == message.id,
                                            isOwn = message.senderId == currentUserId,
                                            conversationType = conversationType,
                                            groupedWithPrevious = item.groupedWithPrevious,
                                            groupedWithNext = item.groupedWithNext,
                                            senderAvatarUrl = senderAvatarUrl,
                                            readCount = readCount,
                                            recipientCount = recipientCount,
                                            currentUserId = currentUserId,
                                            onReply = { onSetReplyTo(message) },
                                            onDelete = { onDeleteMessage(message.id) },
                                            onToggleReaction = { emoji -> onToggleReaction(message.id, emoji) },
                                            baseUrl = baseUrl,
                                            authToken = authToken,
                                            onPreviewAttachment = { previewAttachmentId = it.id },
                                            onOpenAttachment = onOpenAttachment,
                                        )
                                    }
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
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(999.dp),
            tonalElevation = 0.dp,
            color = if (useTelegramLightStyle) Color(0xA8E1F0ED) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            border = androidx.compose.foundation.BorderStroke(
                width = 1.dp,
                color = if (useTelegramLightStyle) Color(0x55A9C6C2) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f),
            ),
        ) {
            Text(
                text = label,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                style = MaterialTheme.typography.labelSmall,
                color = if (useTelegramLightStyle) Color(0xFF5F787A) else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
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

@Composable
private fun AnimatedMessageEntry(
    messageId: Long,
    isOwn: Boolean,
    content: @Composable () -> Unit,
) {
    var isVisible by remember(messageId) { mutableStateOf(false) }

    LaunchedEffect(messageId) {
        isVisible = true
    }

    AnimatedVisibility(
        visible = isVisible,
        enter = fadeIn() +
            slideInHorizontally(initialOffsetX = { fullWidth ->
                if (isOwn) fullWidth / 7 else -fullWidth / 7
            }) +
            scaleIn(initialScale = 0.94f),
        exit = fadeOut() + scaleOut(targetScale = 0.96f),
    ) {
        content()
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
    return palette[(senderId % palette.size).toInt()]
}

private fun Modifier.chatWallpaperPattern(
    backgroundColor: Color,
    primaryColor: Color,
    secondaryColor: Color,
): Modifier = drawWithCache {
    val useTelegramLightStyle = backgroundColor.luminance() > 0.7f
    val patternPrimary = if (useTelegramLightStyle) {
        Color(0xFF76A968).copy(alpha = 0.15f)
    } else {
        primaryColor.copy(alpha = 0.06f)
    }
    val patternSecondary = if (useTelegramLightStyle) {
        Color(0xFF5D9771).copy(alpha = 0.13f)
    } else {
        secondaryColor.copy(alpha = 0.05f)
    }
    val spacing = if (useTelegramLightStyle) 76.dp.toPx() else 88.dp.toPx()
    val symbol = if (useTelegramLightStyle) 10.dp.toPx() else 11.dp.toPx()
    val stroke = if (useTelegramLightStyle) 1.dp.toPx() else 1.2.dp.toPx()
    val cols = (size.width / spacing).toInt() + 2
    val rows = (size.height / spacing).toInt() + 2

    onDrawBehind {
        if (useTelegramLightStyle) {
            drawCircle(
                color = Color(0x30FFFFFF),
                radius = size.minDimension * 0.45f,
                center = Offset(size.width * 0.9f, size.height * 0.18f),
            )
            drawCircle(
                color = Color(0x22A8C97D),
                radius = size.minDimension * 0.38f,
                center = Offset(size.width * 0.16f, size.height * 0.66f),
            )
        }
        for (row in 0 until rows) {
            for (col in 0 until cols) {
                val shiftX = if (row % 2 == 0) spacing * 0.28f else 0f
                val center = Offset(
                    x = (col * spacing) + shiftX - (spacing * 0.2f),
                    y = (row * spacing) + symbol,
                )
                when ((row + col) % 4) {
                    0 -> {
                        drawCircle(
                            color = patternPrimary,
                            radius = symbol,
                            center = center,
                            style = Stroke(width = stroke),
                        )
                        drawCircle(
                            color = patternPrimary,
                            radius = symbol * 0.26f,
                            center = center,
                        )
                    }

                    1 -> {
                        drawLine(
                            color = patternSecondary,
                            start = Offset(center.x - symbol, center.y - symbol),
                            end = Offset(center.x + symbol, center.y + symbol),
                            strokeWidth = stroke,
                        )
                        drawLine(
                            color = patternSecondary,
                            start = Offset(center.x + symbol, center.y - symbol),
                            end = Offset(center.x - symbol, center.y + symbol),
                            strokeWidth = stroke,
                        )
                    }

                    2 -> {
                        drawRoundRect(
                            color = patternPrimary,
                            topLeft = Offset(center.x - (symbol * 1.2f), center.y - (symbol * 0.75f)),
                            size = Size(symbol * 2.4f, symbol * 1.5f),
                            cornerRadius = CornerRadius(symbol * 0.55f),
                            style = Stroke(width = stroke),
                        )
                    }

                    else -> {
                        drawArc(
                            color = patternSecondary,
                            startAngle = 22f,
                            sweepAngle = 300f,
                            useCenter = false,
                            topLeft = Offset(center.x - symbol, center.y - symbol),
                            size = Size(symbol * 2f, symbol * 2f),
                            style = Stroke(width = stroke),
                        )
                        drawLine(
                            color = patternSecondary,
                            start = Offset(center.x + (symbol * 0.45f), center.y - (symbol * 0.8f)),
                            end = Offset(center.x + (symbol * 1.15f), center.y - (symbol * 1.45f)),
                            strokeWidth = stroke,
                        )
                    }
                }
            }
        }
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
            val isRead = readCount > 0
            val checkColor = if (isRead) Color(0xFF4A90E2) else bubbleMetaColor
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Done,
                    contentDescription = "Отправлено",
                    tint = checkColor,
                    modifier = Modifier.size(14.dp)
                )
                if (isRead) {
                    Icon(
                        imageVector = Icons.Default.Done,
                        contentDescription = "Прочитано",
                        tint = checkColor,
                        modifier = Modifier.size(14.dp).offset(x = (-6).dp)
                    )
                }
            }
            if (isRead && recipientCount > 1) {
                Text(
                    text = "$readCount",
                    style = MaterialTheme.typography.labelSmall,
                    color = checkColor,
                )
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
    isOwn: Boolean,
    conversationType: ConversationType?,
    groupedWithPrevious: Boolean,
    groupedWithNext: Boolean,
    senderAvatarUrl: String?,
    readCount: Int,
    recipientCount: Int,
    currentUserId: Long,
    onReply: () -> Unit,
    onDelete: () -> Unit,
    onToggleReaction: (String) -> Unit,
    baseUrl: String,
    authToken: String?,
    onPreviewAttachment: (ChatAttachment) -> Unit,
    onOpenAttachment: (ChatAttachment) -> Unit,
) {
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
    val replyHintScale by animateFloatAsState(
        targetValue = 0.86f + (swipeProgress * 0.14f),
        animationSpec = spring(dampingRatio = 0.8f, stiffness = 650f),
        label = "replyHintScale",
    )
    val replyHintColor by animateColorAsState(
        targetValue = MaterialTheme.colorScheme.primaryContainer.copy(
            alpha = 0.30f + (swipeProgress * 0.28f)
        ),
        label = "replyHintColor",
    )
    val colorScheme = MaterialTheme.colorScheme
    val useTelegramLightStyle = colorScheme.usesTelegramLightChatStyle()
    val reserveAvatarSlot = !isOwn && conversationType != ConversationType.DIRECT
    val showAvatar = reserveAvatarSlot && !groupedWithNext
    val senderAccent = senderAccentColor(message.senderId)
    val bubbleShape = BubbleShape(isOwn = isOwn, groupedWithNext = groupedWithNext)
    val bubbleTextColor = if (isOwn) {
        if (useTelegramLightStyle) Color(0xFF223124) else colorScheme.onPrimaryContainer
    } else {
        if (useTelegramLightStyle) Color(0xFF1F2428) else colorScheme.onSurface
    }
    val bubbleMetaColor = if (isOwn) {
        if (useTelegramLightStyle) Color(0xFF738777) else colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
    } else {
        if (useTelegramLightStyle) Color(0xFF87949A) else colorScheme.onSurfaceVariant.copy(alpha = 0.72f)
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
    val topGap = if (groupedWithPrevious) 1.dp else 4.dp
    val bottomGap = if (groupedWithNext) 1.dp else 3.dp
    val reactionInset = if (message.reactions.isNotEmpty()) 14.dp else 0.dp

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
            Box(
                modifier = Modifier
                    .padding(bottom = reactionInset)
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
                        .widthIn(min = 84.dp, max = 300.dp)
                        .combinedClickable(
                            onClick = {},
                            onLongClick = { showMenu = true },
                        ),
                ) {
                    Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                // Sender name (for group chats, not own messages)
                if (!isOwn && !groupedWithPrevious) {
                    Text(
                        text = message.senderName ?: "???",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                        color = senderAccent,
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

                if (!message.text.isNullOrBlank()) {
                    if (canInlineMeta) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Bottom,
                        ) {
                            Text(
                                text = message.text,
                                style = MaterialTheme.typography.bodyMedium,
                                color = bubbleTextColor,
                                maxLines = 1,
                            )
                            MessageMetaRow(
                                isOwn = isOwn,
                                isEdited = message.isEdited,
                                createdAt = message.createdAt,
                                bubbleMetaColor = bubbleMetaColor,
                                readCount = readCount,
                                recipientCount = recipientCount,
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
                Row(
                    modifier = Modifier.align(Alignment.End),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (message.isEdited) {
                        Text(
                            text = "ред.",
                            style = MaterialTheme.typography.labelSmall,
                            color = bubbleMetaColor,
                        )
                    }
                    Text(
                        text = message.createdAt.format(timeOnlyFormatter),
                        style = MaterialTheme.typography.labelSmall,
                        color = bubbleMetaColor,
                    )
                    if (isOwn) {
                        val isRead = readCount > 0
                        val checkColor = if (isRead) Color(0xFF4A90E2) else bubbleMetaColor
                        // ✓✓ Telegram-style
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Done,
                                contentDescription = "Отправлено",
                                tint = checkColor,
                                modifier = Modifier.size(14.dp)
                            )
                            if (isRead) {
                                Icon(
                                    imageVector = Icons.Default.Done,
                                    contentDescription = "Прочитано",
                                    tint = checkColor,
                                    modifier = Modifier.size(14.dp).offset(x = (-6).dp)
                                )
                            }
                        }
                        if (isRead && recipientCount > 1) {
                            Text(
                                text = "$readCount",
                                style = MaterialTheme.typography.labelSmall,
                                color = checkColor,
                            )
                        }
                    }
                }
                }
                    }
                }

                if (message.reactions.isNotEmpty()) {
                    Row(
                        modifier = Modifier
                            .align(if (isOwn) Alignment.BottomEnd else Alignment.BottomStart)
                            .offset(x = if (isOwn) (-8).dp else 8.dp, y = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        message.reactions.forEach { reaction ->
                            ReactionChip(
                                reaction = reaction,
                                isSelected = reaction.isReactedBy(currentUserId),
                                onClick = { onToggleReaction(reaction.emoji) },
                            )
                        }
                    }
                }
            }

        // Context menu
        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
        ) {
            DropdownMenuItem(
                text = { Text("Ответить") },
                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null) },
                onClick = { showMenu = false; onReply() },
            )
            if (isOwn) {
                DropdownMenuItem(
                    text = { Text("Удалить") },
                    leadingIcon = { Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                    onClick = { showMenu = false; onDelete() },
                )
            }
            // Quick reactions
            DropdownMenuItem(
                text = { Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    listOf("👍", "❤️", "😂", "😮", "😢").forEach { emoji ->
                        TextButton(onClick = { showMenu = false; onToggleReaction(emoji) }) {
                            Text(emoji, style = MaterialTheme.typography.titleLarge)
                        }
                    }
                }},
                onClick = {},
            )
        }
    }
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
                        .pointerInput(attachment.id, scale, hasPrevious, hasNext) {
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
    if (size < 1024 * 1024) return String.format("%.1f КБ", size / 1024f)
    return String.format("%.1f МБ", size / (1024f * 1024f))
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
        .crossfade(true)

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
// Reaction Chip
// ============================================================================

@Composable
private fun ReactionChip(
    reaction: ChatReaction,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val useTelegramLightStyle = MaterialTheme.colorScheme.usesTelegramLightChatStyle()
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(999.dp),
        color = if (isSelected) {
            if (useTelegramLightStyle) Color(0xFFE4F6CF) else MaterialTheme.colorScheme.primaryContainer
        } else {
            if (useTelegramLightStyle) Color(0xF7FFFFFF) else MaterialTheme.colorScheme.surface
        },
        tonalElevation = 0.dp,
        shadowElevation = if (useTelegramLightStyle) 1.2.dp else 1.dp,
        border = if (isSelected) {
            androidx.compose.foundation.BorderStroke(
                1.dp,
                if (useTelegramLightStyle) Color(0x80CAE8AF) else MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
            )
        } else {
            androidx.compose.foundation.BorderStroke(
                1.dp,
                if (useTelegramLightStyle) Color(0x66D6DCDD) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f)
            )
        },
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            horizontalArrangement = Arrangement.spacedBy(3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(reaction.emoji, style = MaterialTheme.typography.bodyMedium)
            if (reaction.count > 1) {
                Text(
                    "${reaction.count}",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isSelected) {
                        if (useTelegramLightStyle) Color(0xFF4F6B4A) else MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        if (useTelegramLightStyle) Color(0xFF748289) else MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
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
    onSend: (String) -> Unit,
    onAttachFile: () -> Unit,
    onTextChanged: (String) -> Unit,
    onCancelReply: () -> Unit,
) {
    var text by remember { mutableStateOf("") }
    val useTelegramLightStyle = MaterialTheme.colorScheme.usesTelegramLightChatStyle()
    val canSend = remember(text) { text.trim().isNotEmpty() }
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
                .navigationBarsPadding()
                .animateContentSize(),
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

            Surface(
                shape = RoundedCornerShape(24.dp),
                color = if (useTelegramLightStyle) Color(0xF4FFFFFF) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.44f),
                border = androidx.compose.foundation.BorderStroke(
                    width = 1.dp,
                    color = if (useTelegramLightStyle) Color(0x66D1DAD8) else Color.Transparent,
                ),
            ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 6.dp, end = 6.dp, top = 4.dp, bottom = 4.dp),
                        verticalAlignment = Alignment.Bottom,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        FilledTonalIconButton(
                            onClick = onAttachFile,
                            enabled = !isSending,
                            colors = IconButtonDefaults.filledTonalIconButtonColors(
                                containerColor = if (useTelegramLightStyle) Color(0xFFF7FAF4) else MaterialTheme.colorScheme.surface,
                                contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            ),
                            modifier = Modifier.size(40.dp),
                        ) {
                            Icon(Icons.Default.Add, contentDescription = "Вложение")
                        }
                        OutlinedTextField(
                            value = text,
                            onValueChange = {
                                text = it
                                onTextChanged(it)
                            },
                            modifier = Modifier.weight(1f),
                            placeholder = {
                                Text(if (replyTo != null) "Напишите ответ..." else "Сообщение")
                            },
                            shape = RoundedCornerShape(22.dp),
                            minLines = 1,
                            maxLines = 5,
                            singleLine = false,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color.Transparent,
                                unfocusedBorderColor = Color.Transparent,
                                disabledBorderColor = Color.Transparent,
                                focusedContainerColor = Color.Transparent,
                                unfocusedContainerColor = Color.Transparent,
                                disabledContainerColor = Color.Transparent,
                                cursorColor = MaterialTheme.colorScheme.primary,
                            ),
                        )

                        FilledIconButton(
                            onClick = {
                                if (canSend) {
                                    onSend(text.trim())
                                    text = ""
                                    onTextChanged("")
                                }
                            },
                            enabled = canSend && !isSending,
                            colors = IconButtonDefaults.filledIconButtonColors(
                                containerColor = sendButtonContainerColor,
                                contentColor = sendButtonContentColor,
                                disabledContainerColor = sendButtonContainerColor,
                                disabledContentColor = sendButtonContentColor,
                            ),
                            modifier = Modifier
                                .size(40.dp)
                                .graphicsLayer {
                                    scaleX = sendButtonScale
                                    scaleY = sendButtonScale
                                },
                        ) {
                            if (isSending) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp))
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

private val timeOnlyFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val systemMessageFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM HH:mm")
