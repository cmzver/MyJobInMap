package com.fieldworker.ui.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
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
import com.fieldworker.domain.model.ChatMessage
import com.fieldworker.domain.model.ChatReaction
import com.fieldworker.domain.model.ConversationType
import com.fieldworker.domain.model.User
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.Headers
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

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
) {
    val coroutineScope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val timelineItems = remember(messages) { buildChatTimelineItems(messages) }
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

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = title,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                    }
                },
                actions = {
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
                },
            )
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
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            reverseLayout = true,
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            items(
                items = timelineItems,
                key = {
                    when (it) {
                        is ChatTimelineItem.DateSeparator -> it.key
                        is ChatTimelineItem.MessageEntry -> "message-${it.message.id}"
                    }
                },
            ) { item ->
                when (item) {
                    is ChatTimelineItem.DateSeparator -> {
                        DateSeparatorChip(label = item.label)
                    }

                    is ChatTimelineItem.MessageEntry -> {
                        val message = item.message
                        val readCount = readReceipts.values.count { it >= message.id }
                        MessageBubble(
                            message = message,
                            isHighlighted = highlightedMessageId == message.id,
                            isOwn = message.senderId == currentUserId,
                            groupedWithPrevious = item.groupedWithPrevious,
                            groupedWithNext = item.groupedWithNext,
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
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp, horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            HorizontalDivider(modifier = Modifier.weight(1f))
            Surface(
                shape = RoundedCornerShape(999.dp),
                tonalElevation = 1.dp,
                color = MaterialTheme.colorScheme.surface,
            ) {
                Text(
                    text = label,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            HorizontalDivider(modifier = Modifier.weight(1f))
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
    groupedWithPrevious: Boolean,
    groupedWithNext: Boolean,
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

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 2.dp, vertical = 1.dp)
            .background(
                color = if (isHighlighted) MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.45f) else MaterialTheme.colorScheme.surface.copy(alpha = 0f),
                shape = RoundedCornerShape(20.dp),
            )
            .padding(horizontal = if (isHighlighted) 6.dp else 0.dp, vertical = if (isHighlighted) 4.dp else 0.dp),
        horizontalAlignment = if (isOwn) Alignment.End else Alignment.Start,
    ) {
        Surface(
            shape = RoundedCornerShape(
                topStart = if (groupedWithPrevious) 10.dp else 16.dp,
                topEnd = if (groupedWithPrevious) 10.dp else 16.dp,
                bottomStart = if (isOwn) {
                    if (groupedWithNext) 10.dp else 16.dp
                } else {
                    if (groupedWithNext) 16.dp else 4.dp
                },
                bottomEnd = if (isOwn) {
                    if (groupedWithNext) 16.dp else 4.dp
                } else {
                    if (groupedWithNext) 10.dp else 16.dp
                },
            ),
            color = if (isOwn)
                MaterialTheme.colorScheme.primaryContainer
            else
                MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier
                .widthIn(max = 300.dp)
                .then(
                    if (isHighlighted) {
                        Modifier.background(
                            color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.08f),
                            shape = RoundedCornerShape(18.dp),
                        )
                    } else {
                        Modifier
                    }
                )
                .combinedClickable(
                    onClick = {},
                    onLongClick = { showMenu = true },
                ),
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                // Sender name (for group chats, not own messages)
                if (!isOwn && !groupedWithPrevious) {
                    Text(
                        text = message.senderName ?: "???",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.height(2.dp))
                }

                // Reply preview
                message.replyTo?.let { reply ->
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.5f),
                        modifier = Modifier.padding(bottom = 4.dp),
                    ) {
                        Column(modifier = Modifier.padding(6.dp)) {
                            Text(
                                text = reply.senderName ?: "",
                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                                color = MaterialTheme.colorScheme.primary,
                            )
                            Text(
                                text = reply.text ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }

                if (!message.text.isNullOrBlank()) {
                    Text(
                        text = message.text,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isOwn)
                            MaterialTheme.colorScheme.onPrimaryContainer
                        else
                            MaterialTheme.colorScheme.onSurfaceVariant,
                    )
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

                // Time + edited
                Row(
                    modifier = Modifier.align(Alignment.End),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (message.isEdited) {
                        Text(
                            text = "ред.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        )
                    }
                    Text(
                        text = message.createdAt.format(timeOnlyFormatter),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    )
                    if (isOwn) {
                        val isRead = readCount > 0
                        val tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = if (isRead) 0.9f else 0.6f)
                        Icon(
                            imageVector = if (isRead) Icons.Default.CheckCircle else Icons.Default.Done,
                            contentDescription = if (isRead) "Прочитано" else "Отправлено",
                            tint = tint,
                            modifier = Modifier.size(14.dp),
                        )
                        if (isRead && recipientCount > 1) {
                            Text(
                                text = "$readCount",
                                style = MaterialTheme.typography.labelSmall,
                                color = tint,
                            )
                        }
                    }
                }
            }
        }

        // Reactions
        if (message.reactions.isNotEmpty()) {
            Row(
                modifier = Modifier.padding(top = 2.dp),
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
        shape = RoundedCornerShape(12.dp),
        color = containerColor,
        tonalElevation = if (isOwn) 0.dp else 1.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (attachment.isImage) {
                AsyncImage(
                    model = previewRequest,
                    contentDescription = attachment.fileName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .clickable(onClick = onPreview),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isOwn) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = formatAttachmentSize(attachment.fileSize),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = attachment.fileName,
                style = MaterialTheme.typography.bodyMedium,
                color = if (isOwn) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = if (isOwn) 0.3f else 0.65f),
                        shape = RoundedCornerShape(10.dp),
                    )
                    .padding(horizontal = 10.dp, vertical = 8.dp),
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = if (attachment.isImage) "Нажмите на превью для полного просмотра" else "Нажмите, чтобы открыть файл",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (attachment.isImage) {
                        TextButton(onClick = onOpen) {
                            Text("Открыть как файл")
                        }
                    }
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
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = if (isSelected)
            MaterialTheme.colorScheme.primaryContainer
        else
            MaterialTheme.colorScheme.surfaceVariant,
        border = if (isSelected)
            androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary)
        else null,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(reaction.emoji, style = MaterialTheme.typography.labelMedium)
            if (reaction.count > 1) {
                Text(
                    "${reaction.count}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
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

    Surface(
        tonalElevation = 2.dp,
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(modifier = Modifier.navigationBarsPadding()) {
            if (!typingText.isNullOrBlank()) {
                Surface(color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)) {
                    Text(
                        text = typingText,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontStyle = FontStyle.Italic,
                    )
                }
            }

            // Reply preview
            if (replyTo != null) {
                Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Default.Refresh,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(Modifier.width(8.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = replyTo.senderName ?: "",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.primary,
                            )
                            Text(
                                text = replyTo.text ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        IconButton(onClick = onCancelReply, modifier = Modifier.size(24.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "Отменить", modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }

            // Input row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    onClick = onAttachFile,
                    enabled = !isSending,
                ) {
                    Text("Файл")
                }
                Spacer(Modifier.width(4.dp))
                OutlinedTextField(
                    value = text,
                    onValueChange = {
                        text = it
                        onTextChanged(it)
                    },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Сообщение...") },
                    shape = RoundedCornerShape(24.dp),
                    maxLines = 4,
                    singleLine = false,
                )
                Spacer(Modifier.width(4.dp))
                IconButton(
                    onClick = {
                        if (text.isNotBlank()) {
                            onSend(text.trim())
                            text = ""
                            onTextChanged("")
                        }
                    },
                    enabled = text.isNotBlank() && !isSending,
                ) {
                    if (isSending) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp))
                    } else {
                        Icon(
                            Icons.AutoMirrored.Filled.Send,
                            contentDescription = "Отправить",
                            tint = if (text.isNotBlank())
                                MaterialTheme.colorScheme.primary
                            else
                                MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

private val timeOnlyFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val systemMessageFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM HH:mm")
