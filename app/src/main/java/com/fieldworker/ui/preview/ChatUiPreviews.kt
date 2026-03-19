package com.fieldworker.ui.preview

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.fieldworker.domain.model.ChatAttachment
import com.fieldworker.domain.model.ChatMessage
import com.fieldworker.domain.model.ChatReaction
import com.fieldworker.domain.model.Conversation
import com.fieldworker.domain.model.ConversationDetail
import com.fieldworker.domain.model.ConversationMember
import com.fieldworker.domain.model.ConversationType
import com.fieldworker.domain.model.LastMessagePreview
import com.fieldworker.domain.model.MessageType
import com.fieldworker.domain.model.ReplyPreview
import com.fieldworker.domain.model.User
import com.fieldworker.domain.model.UserRole
import com.fieldworker.ui.chat.ChatScreen
import com.fieldworker.ui.chat.ConversationListFilter
import com.fieldworker.ui.chat.ConversationListScreen
import com.fieldworker.ui.theme.FieldWorkerTheme
import java.time.LocalDateTime

private object ChatPreviewData {
    private val now = LocalDateTime.of(2026, 3, 19, 14, 30)

    val me = User(
        id = 1,
        username = "dispatcher",
        fullName = "Алексей Смирнов",
        email = "dispatcher@fieldworker.local",
        phone = "+7 999 111-22-33",
        role = UserRole.DISPATCHER,
    )

    val colleague = User(
        id = 2,
        username = "worker.ivanov",
        fullName = "Иван Иванов",
        email = "ivanov@fieldworker.local",
        phone = "+7 999 222-33-44",
        role = UserRole.WORKER,
    )

    val manager = User(
        id = 3,
        username = "admin",
        fullName = "Мария Кузнецова",
        email = "admin@fieldworker.local",
        phone = "+7 999 333-44-55",
        role = UserRole.ADMIN,
    )

    val listConversations = listOf(
        Conversation(
            id = 101,
            type = ConversationType.DIRECT,
            name = null,
            displayName = colleague.getDisplayName(),
            avatarUrl = null,
            taskId = null,
            unreadCount = 3,
            isMuted = false,
            isArchived = false,
            lastMessage = LastMessagePreview(
                id = 5001,
                text = "Выслал фото с объекта, проверьте статус.",
                senderName = colleague.getDisplayName(),
                createdAt = now.minusMinutes(8),
            ),
            createdAt = now.minusDays(4),
            updatedAt = now.minusMinutes(8),
        ),
        Conversation(
            id = 202,
            type = ConversationType.GROUP,
            name = "Бригада Север",
            displayName = "Бригада Север",
            avatarUrl = null,
            taskId = null,
            unreadCount = 12,
            isMuted = true,
            isArchived = false,
            lastMessage = LastMessagePreview(
                id = 5002,
                text = "Заявка закрыта, можно не дублировать выезд.",
                senderName = manager.getDisplayName(),
                createdAt = now.minusHours(2),
            ),
            createdAt = now.minusDays(9),
            updatedAt = now.minusHours(2),
        ),
        Conversation(
            id = 303,
            type = ConversationType.TASK,
            name = "Заявка 1138996",
            displayName = "Заявка 1138996",
            avatarUrl = null,
            taskId = 1138996,
            unreadCount = 0,
            isMuted = false,
            isArchived = true,
            lastMessage = LastMessagePreview(
                id = 5003,
                text = "Работы выполнены, отправил акт.",
                senderName = me.getDisplayName(),
                createdAt = now.minusDays(1),
            ),
            createdAt = now.minusDays(14),
            updatedAt = now.minusDays(1),
        ),
    )

    val groupDetail = ConversationDetail(
        id = 202,
        type = ConversationType.GROUP,
        name = "Бригада Север",
        displayName = "Бригада Север",
        avatarUrl = null,
        taskId = null,
        organizationId = 1,
        createdAt = now.minusDays(9),
        updatedAt = now.minusHours(2),
        members = listOf(
            ConversationMember(
                userId = me.id,
                username = me.username,
                fullName = me.fullName,
                role = "owner",
                lastReadMessageId = 902L,
                isMuted = false,
                isArchived = false,
            ),
            ConversationMember(
                userId = colleague.id,
                username = colleague.username,
                fullName = colleague.fullName,
                role = "member",
                lastReadMessageId = 901L,
                isMuted = false,
                isArchived = false,
            ),
            ConversationMember(
                userId = manager.id,
                username = manager.username,
                fullName = manager.fullName,
                role = "admin",
                lastReadMessageId = 900L,
                isMuted = false,
                isArchived = false,
            ),
        ),
    )

    val messages = listOf(
        ChatMessage(
            id = 903,
            conversationId = 202,
            senderId = colleague.id,
            senderName = colleague.getDisplayName(),
            text = "Скинул свежие фото по прорыву.",
            messageType = MessageType.TEXT,
            isEdited = false,
            isDeleted = false,
            replyTo = null,
            attachments = listOf(
                ChatAttachment(
                    id = 9001,
                    fileName = "scene-photo.jpg",
                    fileSize = 1_248_112,
                    mimeType = "image/jpeg",
                    filePath = null,
                    thumbnailPath = null,
                )
            ),
            reactions = listOf(
                ChatReaction("👍", 2, listOf(me.id, manager.id)),
            ),
            createdAt = now.minusMinutes(38),
            editedAt = null,
        ),
        ChatMessage(
            id = 904,
            conversationId = 202,
            senderId = me.id,
            senderName = me.getDisplayName(),
            text = "Проверил, отправляю на закрытие.",
            messageType = MessageType.TEXT,
            isEdited = true,
            isDeleted = false,
            replyTo = ReplyPreview(
                id = 903,
                text = "Скинул свежие фото по прорыву.",
                senderName = colleague.getDisplayName(),
            ),
            attachments = emptyList(),
            reactions = listOf(
                ChatReaction("✅", 1, listOf(me.id)),
                ChatReaction("🔥", 3, listOf(me.id, colleague.id, manager.id)),
            ),
            createdAt = now.minusMinutes(34),
            editedAt = now.minusMinutes(30),
        ),
        ChatMessage(
            id = 905,
            conversationId = 202,
            senderId = manager.id,
            senderName = manager.getDisplayName(),
            text = "Мария набирает сообщение...",
            messageType = MessageType.TEXT,
            isEdited = false,
            isDeleted = false,
            replyTo = null,
            attachments = emptyList(),
            reactions = emptyList(),
            createdAt = now.minusMinutes(2),
            editedAt = null,
        ),
    )
}

@Preview(name = "Chat List Light", showBackground = true, showSystemUi = true)
@Composable
private fun ChatListLightPreview() {
    FieldWorkerTheme(darkTheme = false) {
        Surface {
            ConversationListScreen(
                conversations = ChatPreviewData.listConversations,
                selectedFilter = ConversationListFilter.ACTIVE,
                currentUserId = ChatPreviewData.me.id,
                availableUsers = listOf(ChatPreviewData.me, ChatPreviewData.colleague, ChatPreviewData.manager),
                isLoading = false,
                isLoadingUsers = false,
                isCreatingConversation = false,
                onConversationClick = {},
                onFilterChange = {},
                onLoadUsers = {},
                onCreateDirectConversation = {},
                onCreateGroupConversation = { _, _ -> },
                onRefresh = {},
                onArchiveConversation = {},
            )
        }
    }
}

@Preview(name = "Chat List Dark", showBackground = true, showSystemUi = true)
@Composable
private fun ChatListDarkPreview() {
    FieldWorkerTheme(darkTheme = true) {
        Surface {
            ConversationListScreen(
                conversations = ChatPreviewData.listConversations,
                selectedFilter = ConversationListFilter.ARCHIVED,
                currentUserId = ChatPreviewData.me.id,
                availableUsers = listOf(ChatPreviewData.me, ChatPreviewData.colleague, ChatPreviewData.manager),
                isLoading = false,
                isLoadingUsers = false,
                isCreatingConversation = false,
                onConversationClick = {},
                onFilterChange = {},
                onLoadUsers = {},
                onCreateDirectConversation = {},
                onCreateGroupConversation = { _, _ -> },
                onRefresh = {},
                onArchiveConversation = {},
            )
        }
    }
}

@Preview(name = "Chat Screen Full", showBackground = true, showSystemUi = true)
@Composable
private fun ChatScreenFullPreview() {
    FieldWorkerTheme(darkTheme = false) {
        Surface(modifier = Modifier.fillMaxSize()) {
            ChatScreen(
                title = "Бригада Север",
                conversationDetail = ChatPreviewData.groupDetail,
                messages = ChatPreviewData.messages,
                hasMore = true,
                pendingUnreadAnchorMessageId = null,
                isPreparingUnreadAnchor = false,
                lastReadMessageId = 904L,
                isLoadingMessages = false,
                isSending = false,
                replyTo = ChatPreviewData.messages[1],
                typingText = "Мария печатает...",
                readReceipts = mapOf(
                    ChatPreviewData.me.id to 904L,
                    ChatPreviewData.colleague.id to 904L,
                ),
                recipientCount = 2,
                availableUsers = listOf(ChatPreviewData.me, ChatPreviewData.colleague, ChatPreviewData.manager),
                isLoadingUsers = false,
                baseUrl = "https://example.local:8001",
                authToken = "preview-token",
                isMuted = true,
                isArchived = false,
                isSavingConversation = false,
                activeManagementUserId = null,
                currentUserId = ChatPreviewData.me.id,
                onBack = {},
                onLoadUsers = {},
                onToggleMute = {},
                onToggleArchive = {},
                onRenameConversation = {},
                onAddMembers = {},
                onRemoveMember = {},
                onUpdateMemberRole = { _, _ -> },
                onTransferOwnership = {},
                onSendMessage = {},
                onAttachFile = {},
                onMessageInputChanged = {},
                onLoadMore = {},
                onDeleteMessage = {},
                onToggleReaction = { _, _ -> },
                onSetReplyTo = {},
                onOpenAttachment = {},
                onVisibleMessagesRead = {},
                onUnreadAnchorConsumed = {},
            )
        }
    }
}

@Preview(name = "Chat Screen Dark Compact", showBackground = true, device = "spec:width=411dp,height=891dp,dpi=420")
@Composable
private fun ChatScreenDarkCompactPreview() {
    FieldWorkerTheme(darkTheme = true) {
        Surface(modifier = Modifier.fillMaxSize()) {
            ChatScreen(
                title = "Личный чат",
                conversationDetail = ChatPreviewData.groupDetail.copy(
                    type = ConversationType.DIRECT,
                    displayName = "Иван Иванов",
                    name = null,
                ),
                messages = ChatPreviewData.messages.take(2),
                hasMore = false,
                pendingUnreadAnchorMessageId = null,
                isPreparingUnreadAnchor = false,
                lastReadMessageId = 904L,
                isLoadingMessages = false,
                isSending = true,
                replyTo = null,
                typingText = null,
                readReceipts = emptyMap(),
                recipientCount = 1,
                availableUsers = listOf(ChatPreviewData.me, ChatPreviewData.colleague),
                isLoadingUsers = false,
                baseUrl = "https://example.local:8001",
                authToken = "preview-token",
                isMuted = false,
                isArchived = true,
                isSavingConversation = false,
                activeManagementUserId = null,
                currentUserId = ChatPreviewData.me.id,
                onBack = {},
                onLoadUsers = {},
                onToggleMute = {},
                onToggleArchive = {},
                onRenameConversation = {},
                onAddMembers = {},
                onRemoveMember = {},
                onUpdateMemberRole = { _, _ -> },
                onTransferOwnership = {},
                onSendMessage = {},
                onAttachFile = {},
                onMessageInputChanged = {},
                onLoadMore = {},
                onDeleteMessage = {},
                onToggleReaction = { _, _ -> },
                onSetReplyTo = {},
                onOpenAttachment = {},
                onVisibleMessagesRead = {},
                onUnreadAnchorConsumed = {},
            )
        }
    }
}
