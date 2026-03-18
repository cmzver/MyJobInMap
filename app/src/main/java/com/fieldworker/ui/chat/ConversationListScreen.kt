package com.fieldworker.ui.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.fieldworker.domain.model.Conversation
import com.fieldworker.domain.model.ConversationType
import com.fieldworker.domain.model.User
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationListScreen(
    conversations: List<Conversation>,
    selectedFilter: ConversationListFilter,
    currentUserId: Long,
    availableUsers: List<User>,
    isLoading: Boolean,
    isLoadingUsers: Boolean,
    isCreatingConversation: Boolean,
    onConversationClick: (Long) -> Unit,
    onFilterChange: (ConversationListFilter) -> Unit,
    onLoadUsers: (Boolean) -> Unit,
    onCreateDirectConversation: (Long) -> Unit,
    onCreateGroupConversation: (String, List<Long>) -> Unit,
    onRefresh: () -> Unit,
) {
    var showCreateDialog by remember { mutableStateOf(false) }
    val filteredConversations by remember(conversations, selectedFilter) {
        androidx.compose.runtime.mutableStateOf(
            conversations.filter { conversation ->
                when (selectedFilter) {
                    ConversationListFilter.ACTIVE -> !conversation.isArchived
                    ConversationListFilter.ARCHIVED -> conversation.isArchived
                }
            }
        )
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Header
            Surface(color = MaterialTheme.colorScheme.background) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 20.dp, vertical = 16.dp)
                ) {
                    Text(
                        text = "Чаты",
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = selectedFilter == ConversationListFilter.ACTIVE,
                            onClick = { onFilterChange(ConversationListFilter.ACTIVE) },
                            label = { Text("Активные") },
                        )
                        FilterChip(
                            selected = selectedFilter == ConversationListFilter.ARCHIVED,
                            onClick = { onFilterChange(ConversationListFilter.ARCHIVED) },
                            label = { Text("Архив") },
                        )
                    }
                }
            }

            // Content
            PullToRefreshBox(
                isRefreshing = isLoading,
                onRefresh = onRefresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                if (filteredConversations.isEmpty() && !isLoading) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                Icons.Default.Email,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(12.dp))
                            Text(
                                if (selectedFilter == ConversationListFilter.ARCHIVED) "Архив пуст" else "Нет чатов",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(vertical = 4.dp, horizontal = 0.dp),
                    ) {
                        items(filteredConversations, key = { it.id }) { conversation ->
                            ConversationItem(
                                conversation = conversation,
                                onClick = { onConversationClick(conversation.id) },
                            )
                        }
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = {
                showCreateDialog = true
                onLoadUsers(false)
            },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .navigationBarsPadding()
                .padding(16.dp),
        ) {
            Icon(Icons.Default.Add, contentDescription = "Новый чат")
        }
    }

    if (showCreateDialog) {
        NewConversationDialog(
            currentUserId = currentUserId,
            users = availableUsers,
            isLoadingUsers = isLoadingUsers,
            isSubmitting = isCreatingConversation,
            onDismiss = { showCreateDialog = false },
            onRefreshUsers = { onLoadUsers(true) },
            onCreateDirect = { userId ->
                onCreateDirectConversation(userId)
                showCreateDialog = false
            },
            onCreateGroup = { name, userIds ->
                onCreateGroupConversation(name, userIds)
                showCreateDialog = false
            },
        )
    }
}

@Composable
private fun ConversationItem(
    conversation: Conversation,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.background,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Avatar
            Surface(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape),
                color = when (conversation.type) {
                    ConversationType.DIRECT -> MaterialTheme.colorScheme.primaryContainer
                    ConversationType.GROUP -> MaterialTheme.colorScheme.secondaryContainer
                    ConversationType.TASK -> MaterialTheme.colorScheme.tertiaryContainer
                    ConversationType.ORG_GENERAL -> MaterialTheme.colorScheme.surfaceVariant
                },
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = when (conversation.type) {
                            ConversationType.DIRECT -> Icons.Default.Person
                            ConversationType.GROUP -> Icons.Default.AccountCircle
                            ConversationType.TASK -> Icons.Default.Notifications
                            ConversationType.ORG_GENERAL -> Icons.Default.AccountCircle
                        },
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(Modifier.width(12.dp))

            // Text content
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = conversation.displayName ?: conversation.name ?: "Чат",
                        style = MaterialTheme.typography.bodyLarge.copy(
                            fontWeight = if (conversation.unreadCount > 0) FontWeight.SemiBold else FontWeight.Normal
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    if (conversation.isArchived) {
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = "Архив",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (conversation.isMuted) {
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = "Без звука",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    conversation.lastMessage?.let { msg ->
                        Text(
                            text = formatChatTime(msg.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (conversation.unreadCount > 0)
                                MaterialTheme.colorScheme.primary
                            else
                                MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val preview = conversation.lastMessage
                    Text(
                        text = if (preview != null) {
                            val sender = preview.senderName?.let { "$it: " } ?: ""
                            "$sender${preview.text ?: "Вложение"}"
                        } else {
                            "Нет сообщений"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    if (conversation.unreadCount > 0) {
                        Spacer(Modifier.width(8.dp))
                        Badge(containerColor = MaterialTheme.colorScheme.primary) {
                            Text("${conversation.unreadCount}")
                        }
                    }
                }
            }
        }
    }
}

private val timeFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val dateFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM")

private fun formatChatTime(dateTime: LocalDateTime): String {
    val now = LocalDateTime.now()
    val daysBetween = ChronoUnit.DAYS.between(dateTime.toLocalDate(), now.toLocalDate())
    return when {
        daysBetween == 0L -> dateTime.format(timeFormatter)
        daysBetween == 1L -> "вчера"
        daysBetween < 7L -> "${daysBetween}д"
        else -> dateTime.format(dateFormatter)
    }
}
