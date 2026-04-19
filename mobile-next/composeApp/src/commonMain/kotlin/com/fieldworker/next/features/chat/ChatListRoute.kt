package com.fieldworker.next.features.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChatBubble
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.fieldworker.next.core.designsystem.AvatarSize
import com.fieldworker.next.core.designsystem.FwAvatar
import com.fieldworker.next.core.designsystem.FwCountBadge
import com.fieldworker.next.core.designsystem.FwEmptyState
import com.fieldworker.next.core.designsystem.FwListSkeleton
import com.fieldworker.next.core.designsystem.FwTheme
import com.fieldworker.next.domain.model.Conversation
import com.fieldworker.next.domain.model.ConversationType
import org.koin.compose.viewmodel.koinViewModel

@Composable
fun ChatListRoute(
    modifier: Modifier = Modifier,
    onConversationSelected: (Long) -> Unit = {},
    viewModel: ChatListViewModel = koinViewModel(),
) {
    val conversations by viewModel.conversations.collectAsState()
    val state by viewModel.state.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()

    Column(modifier = modifier.fillMaxSize()) {
        // Header
        Text(
            text = "Чат",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
        )

        // Search bar
        TextField(
            value = searchQuery,
            onValueChange = viewModel::onSearchQueryChanged,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            placeholder = {
                Text(
                    "Поиск чатов...",
                    style = MaterialTheme.typography.bodyMedium,
                )
            },
            leadingIcon = {
                Icon(
                    imageVector = Icons.Rounded.Search,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(onClick = { viewModel.onSearchQueryChanged("") }) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = "Очистить",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
            ),
            textStyle = MaterialTheme.typography.bodyMedium,
        )

        Spacer(Modifier.height(4.dp))

        when {
            state.isLoading -> {
                FwListSkeleton(count = 6, modifier = Modifier.padding(horizontal = 16.dp))
            }
            conversations.isEmpty() -> {
                FwEmptyState(
                    icon = Icons.Rounded.ChatBubble,
                    title = "Нет чатов",
                    subtitle = "Чаты по заявкам появятся здесь автоматически",
                    modifier = Modifier.fillMaxSize(),
                )
            }
            else -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(conversations, key = { it.id }) { conversation ->
                        ConversationItem(
                            conversation = conversation,
                            onClick = { onConversationSelected(conversation.id) },
                        )
                        HorizontalDivider(
                            color = FwTheme.extended.divider,
                            modifier = Modifier.padding(start = 76.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ConversationItem(
    conversation: Conversation,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        FwAvatar(
            name = conversation.displayName(),
            size = AvatarSize.Medium,
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = conversation.displayName(),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (conversation.unreadCount > 0) FontWeight.SemiBold else FontWeight.Normal,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                conversation.lastMessage?.let { msg ->
                    Text(
                        text = msg.createdAt.takeLastTime(),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (conversation.unreadCount > 0) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
            }
            Spacer(Modifier.height(2.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val previewText = conversation.lastMessage?.let { msg ->
                    val prefix = if (conversation.type != ConversationType.DIRECT) {
                        "${msg.senderName}: "
                    } else ""
                    "$prefix${msg.text ?: "[вложение]"}"
                } ?: "Нет сообщений"

                Text(
                    text = previewText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (conversation.unreadCount > 0) {
                    Spacer(Modifier.width(8.dp))
                    Box(contentAlignment = Alignment.Center) {
                        FwCountBadge(count = conversation.unreadCount)
                    }
                }
            }
        }
    }
}

private fun Conversation.displayName(): String {
    return name ?: "Чат #$id"
}

/**
 * Extract time portion from ISO datetime string for compact display.
 * e.g. "2026-04-15T10:30:00" → "10:30"
 */
private fun String.takeLastTime(): String {
    val tIndex = indexOf('T')
    if (tIndex < 0) return this
    val timePart = substring(tIndex + 1)
    return timePart.take(5) // "HH:mm"
}
