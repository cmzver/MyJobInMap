package com.fieldworker.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
) {
    // Auto-refresh when screen appears with no data (e.g. after offline / reinstall)
    LaunchedEffect(conversations.isEmpty(), isLoading) {
        if (conversations.isEmpty() && !isLoading) {
            onRefresh()
        }
    }

    var showCreateDialog by remember { mutableStateOf(false) }
    var searchMode by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    val filteredConversations = remember(conversations, selectedFilter, searchQuery) {
        conversations.filter { conversation ->
            val matchesFilter = when (selectedFilter) {
                ConversationListFilter.ACTIVE -> !conversation.isArchived
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
            // Header: title + search + filter tabs
            ConversationListHeader(
                searchMode = searchMode,
                searchQuery = searchQuery,
                selectedFilter = selectedFilter,
                activeCount = conversations.count { !it.isArchived },
                archivedCount = conversations.count { it.isArchived },
                onSearchModeChange = { searchMode = it },
                onSearchQueryChange = { searchQuery = it },
                onFilterChange = onFilterChange,
                onCreateClick = {
                    showCreateDialog = true
                    onLoadUsers(false)
                },
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
                        contentPadding = PaddingValues(vertical = 4.dp),
                    ) {
                        items(filteredConversations, key = { it.id }) { conversation ->
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

@Composable
private fun ConversationListHeader(
    searchMode: Boolean,
    searchQuery: String,
    selectedFilter: ConversationListFilter,
    activeCount: Int,
    archivedCount: Int,
    onSearchModeChange: (Boolean) -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onFilterChange: (ConversationListFilter) -> Unit,
    onCreateClick: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        if (searchMode) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = onSearchQueryChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = { Text("Поиск чатов...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    IconButton(onClick = {
                        if (searchQuery.isNotBlank()) onSearchQueryChange("")
                        else onSearchModeChange(false)
                    }) {
                        Icon(Icons.Default.Close, contentDescription = "Закрыть")
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
            )
        } else {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Чаты",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { onSearchModeChange(true) }) {
                    Icon(Icons.Default.Search, contentDescription = "Поиск")
                }
                IconButton(onClick = onCreateClick) {
                    Icon(Icons.Default.Add, contentDescription = "Новый чат")
                }
            }
        }

        val selectedIndex = if (selectedFilter == ConversationListFilter.ACTIVE) 0 else 1
        TabRow(
            selectedTabIndex = selectedIndex,
            containerColor = MaterialTheme.colorScheme.background,
        ) {
            Tab(
                selected = selectedIndex == 0,
                onClick = { onFilterChange(ConversationListFilter.ACTIVE) },
                text = { Text("Активные ($activeCount)") },
            )
            Tab(
                selected = selectedIndex == 1,
                onClick = { onFilterChange(ConversationListFilter.ARCHIVED) },
                text = { Text("Архив ($archivedCount)") },
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
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ChatAvatar(
            name = title,
            id = conversation.id,
            type = conversation.type,
            avatarUrl = conversation.avatarUrl,
            baseUrl = baseUrl,
            authToken = authToken,
            size = 48,
        )

        Spacer(Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontWeight = if (isUnread) FontWeight.SemiBold else FontWeight.Normal,
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )

                if (conversation.isMuted) {
                    Spacer(Modifier.width(4.dp))
                    Icon(
                        Icons.Default.Notifications,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(14.dp),
                    )
                }

                if (preview != null) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = formatChatTime(preview.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isUnread) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(Modifier.height(2.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = previewText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )

                if (isUnread) {
                    Spacer(Modifier.width(8.dp))
                    Badge(
                        containerColor = if (conversation.isMuted)
                            MaterialTheme.colorScheme.onSurfaceVariant
                        else MaterialTheme.colorScheme.primary,
                    ) {
                        Text(
                            text = if (conversation.unreadCount > 99) "99+"
                            else conversation.unreadCount.toString(),
                        )
                    }
                }
            }

            if (conversation.isArchived) {
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "В архиве",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    HorizontalDivider(
        modifier = Modifier.padding(start = 76.dp),
        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f),
    )
}

@Composable
private fun EmptyConversationState(
    selectedFilter: ConversationListFilter,
    searchQuery: String,
    onCreateClick: () -> Unit,
    onClearSearch: () -> Unit,
) {
    val isSearching = searchQuery.isNotBlank()
    val title = when {
        isSearching -> "Ничего не найдено"
        selectedFilter == ConversationListFilter.ARCHIVED -> "Архив пуст"
        else -> "Пока нет чатов"
    }
    val description = when {
        isSearching -> "Попробуйте изменить запрос."
        selectedFilter == ConversationListFilter.ARCHIVED -> "Архивированные диалоги появятся здесь."
        else -> "Создайте первый диалог."
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Default.Email,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(48.dp),
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = description,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        if (isSearching) {
            TextButton(onClick = onClearSearch) { Text("Очистить поиск") }
        } else {
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
