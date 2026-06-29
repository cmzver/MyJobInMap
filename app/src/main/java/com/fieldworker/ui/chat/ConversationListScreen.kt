package com.fieldworker.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.fieldworker.domain.model.Conversation
import com.fieldworker.domain.model.ConversationType
import com.fieldworker.domain.model.User
import com.fieldworker.ui.chat.components.ChatAvatar
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
    baseUrl: String,
    authToken: String?,
    isCreatingConversation: Boolean,
    onConversationClick: (Long) -> Unit,
    onFilterChange: (ConversationListFilter) -> Unit,
    onLoadUsers: (Boolean) -> Unit,
    onCreateDirectConversation: (Long) -> Unit,
    onCreateGroupConversation: (String, List<Long>) -> Unit,
    onRefresh: () -> Unit,
    onOpenMenu: (() -> Unit)? = null,
) {
    LaunchedEffect(conversations.isEmpty(), isLoading) {
        if (conversations.isEmpty() && !isLoading) {
            onRefresh()
        }
    }

    var showCreateDialog by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    val filteredConversations = remember(conversations, selectedFilter, searchQuery) {
        conversations.filter { conversation ->
            val matchesFilter = when (selectedFilter) {
                ConversationListFilter.ACTIVE -> !conversation.isArchived
                ConversationListFilter.UNREAD -> !conversation.isArchived && conversation.unreadCount > 0
                ConversationListFilter.ARCHIVED -> conversation.isArchived
            }
            val q = searchQuery.trim()
            val matchesSearch = if (q.isBlank()) {
                true
            } else {
                val normalized = q.lowercase()
                val title = (conversation.displayName ?: conversation.name ?: "").lowercase()
                val message = conversation.lastMessage?.text.orEmpty().lowercase()
                val sender = conversation.lastMessage?.senderName.orEmpty().lowercase()
                title.contains(normalized) || message.contains(normalized) || sender.contains(normalized)
            }
            matchesFilter && matchesSearch
        }
    }

    val showFab by remember(listState, filteredConversations) {
        derivedStateOf {
            filteredConversations.isNotEmpty() && listState.firstVisibleItemIndex > 1
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            ConversationListHeader(
                searchQuery = searchQuery,
                selectedFilter = selectedFilter,
                activeCount = conversations.count { !it.isArchived },
                archivedCount = conversations.count { it.isArchived },
                onSearchQueryChange = { searchQuery = it },
                onFilterChange = onFilterChange,
                onCreateClick = {
                    showCreateDialog = true
                    onLoadUsers(false)
                },
                onOpenMenu = onOpenMenu,
            )

            PullToRefreshBox(
                isRefreshing = isLoading,
                onRefresh = onRefresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                if (filteredConversations.isEmpty() && !isLoading) {
                    EmptyConversationState(
                        selectedFilter = selectedFilter,
                        searchQuery = searchQuery,
                        onCreateClick = {
                            showCreateDialog = true
                            onLoadUsers(false)
                        },
                        onClearSearch = { searchQuery = "" },
                    )
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(top = 4.dp, bottom = 80.dp),
                    ) {
                        items(
                            filteredConversations,
                            key = { it.id },
                            contentType = { "conversation" },
                        ) { conversation ->
                            ConversationItem(
                                conversation = conversation,
                                baseUrl = baseUrl,
                                authToken = authToken,
                                onClick = { onConversationClick(conversation.id) },
                            )
                        }
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = showFab,
            enter = fadeIn() + scaleIn(initialScale = 0.86f),
            exit = fadeOut() + scaleOut(targetScale = 0.86f),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .navigationBarsPadding()
                .padding(16.dp),
        ) {
            FloatingActionButton(
                onClick = {
                    showCreateDialog = true
                    onLoadUsers(false)
                },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ) {
                Icon(Icons.Default.Add, contentDescription = "Новый чат")
            }
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConversationListHeader(
    searchQuery: String,
    selectedFilter: ConversationListFilter,
    activeCount: Int,
    archivedCount: Int,
    onSearchQueryChange: (String) -> Unit,
    onFilterChange: (ConversationListFilter) -> Unit,
    onCreateClick: () -> Unit,
    onOpenMenu: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 8.dp, end = 8.dp, top = 12.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onOpenMenu != null) {
                IconButton(onClick = onOpenMenu) {
                    Icon(Icons.Default.Menu, contentDescription = "Меню")
                }
            }
            Text(
                text = "Чаты",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = if (onOpenMenu != null) 4.dp else 12.dp),
            )
            IconButton(onClick = onCreateClick) {
                Icon(
                    Icons.Default.Add,
                    contentDescription = "Новый чат",
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
        }

        // Search bar
        TextField(
            value = searchQuery,
            onValueChange = onSearchQueryChange,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(14.dp)),
            placeholder = {
                Text(
                    "Поиск",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            },
            leadingIcon = {
                Icon(
                    Icons.Default.Search,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(onClick = { onSearchQueryChange("") }) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = "Очистить",
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            },
            singleLine = true,
            colors = TextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                disabledIndicatorColor = Color.Transparent,
            ),
            textStyle = MaterialTheme.typography.bodyMedium,
        )

        Spacer(Modifier.height(4.dp))

        val selectedIndex = when (selectedFilter) {
            ConversationListFilter.ACTIVE -> 0
            ConversationListFilter.UNREAD -> 0
            ConversationListFilter.ARCHIVED -> 1
        }
        SecondaryTabRow(
            selectedTabIndex = selectedIndex,
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Tab(
                selected = selectedIndex == 0,
                onClick = { onFilterChange(ConversationListFilter.ACTIVE) },
                text = {
                    Text(
                        "Активные${if (activeCount > 0) " $activeCount" else ""}",
                        style = MaterialTheme.typography.labelLarge,
                    )
                },
            )
            Tab(
                selected = selectedIndex == 1,
                onClick = { onFilterChange(ConversationListFilter.ARCHIVED) },
                text = {
                    Text(
                        "Архив${if (archivedCount > 0) " $archivedCount" else ""}",
                        style = MaterialTheme.typography.labelLarge,
                    )
                },
            )
        }
    }
}

@Composable
private fun ConversationItem(
    conversation: Conversation,
    baseUrl: String,
    authToken: String?,
    onClick: () -> Unit,
) {
    val isUnread = conversation.unreadCount > 0
    val title = conversation.displayName ?: conversation.name ?: "Чат"
    val preview = conversation.lastMessage
    val previewText = when {
        preview == null -> "Начните разговор"
        else -> {
            val sender = preview.senderName
                ?.takeIf { conversation.type != ConversationType.DIRECT }
                ?.let { "$it: " }
                .orEmpty()
            val text = preview.text ?: "Вложение"
            "$sender$text"
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(
                if (isUnread) MaterialTheme.colorScheme.primary.copy(alpha = 0.04f)
                else Color.Transparent,
            )
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            ChatAvatar(
                name = title,
                id = conversation.id,
                type = conversation.type,
                avatarUrl = conversation.avatarUrl,
                baseUrl = baseUrl,
                authToken = authToken,
                size = 52,
            )
            if (isUnread && !conversation.isMuted) {
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .align(Alignment.TopEnd)
                        .background(MaterialTheme.colorScheme.surface, CircleShape)
                        .padding(2.dp)
                        .background(MaterialTheme.colorScheme.primary, CircleShape),
                )
            }
        }

        Spacer(Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (isUnread) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (conversation.isMuted) {
                        Icon(
                            Icons.Default.Notifications,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                            modifier = Modifier.size(14.dp),
                        )
                    }
                    if (preview != null) {
                        Text(
                            text = formatChatTime(preview.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isUnread && !conversation.isMuted)
                                MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Spacer(Modifier.height(3.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = previewText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isUnread)
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f)
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )

                if (isUnread) {
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                color = if (conversation.isMuted)
                                    MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                                else MaterialTheme.colorScheme.primary,
                                shape = CircleShape,
                            )
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = if (conversation.unreadCount > 99) "99+" else conversation.unreadCount.toString(),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (conversation.isMuted)
                                MaterialTheme.colorScheme.surface
                            else MaterialTheme.colorScheme.onPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                if (conversation.isArchived) {
                    Spacer(Modifier.width(6.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant,
                                RoundedCornerShape(6.dp),
                            )
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    ) {
                        Text(
                            text = "архив",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyConversationState(
    selectedFilter: ConversationListFilter,
    searchQuery: String,
    onCreateClick: () -> Unit,
    onClearSearch: () -> Unit,
) {
    val isSearching = searchQuery.isNotBlank()
    val isArchive = selectedFilter == ConversationListFilter.ARCHIVED

    val title = when {
        isSearching -> "Ничего не найдено"
        isArchive -> "Архив пуст"
        else -> "Нет активных чатов"
    }
    val description = when {
        isSearching -> "Попробуйте изменить запрос"
        isArchive -> "Архивированные диалоги появятся здесь"
        else -> "Создайте первый диалог с коллегой"
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(72.dp)
                .background(
                    MaterialTheme.colorScheme.primaryContainer,
                    CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Default.Email,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.size(32.dp),
            )
        }
        Spacer(Modifier.height(20.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = description,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))
        if (isSearching) {
            TextButton(onClick = onClearSearch) { Text("Очистить поиск") }
        } else if (!isArchive) {
            TextButton(onClick = onCreateClick) { Text("Новый чат") }
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
