package com.fieldworker.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
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
import androidx.compose.foundation.layout.statusBarsPadding
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
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.fieldworker.R
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
    onArchiveConversation: (Long) -> Unit = {},
) {
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

    val backgroundBrush = Brush.verticalGradient(
        colors = listOf(
            MaterialTheme.colorScheme.background,
            MaterialTheme.colorScheme.background,
            MaterialTheme.colorScheme.primary.copy(alpha = 0.04f),
            MaterialTheme.colorScheme.secondary.copy(alpha = 0.03f),
        )
    )
    val showFab by remember(listState, filteredConversations) {
        derivedStateOf {
            filteredConversations.isNotEmpty() && listState.firstVisibleItemIndex > 1
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundBrush),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            ConversationListHeader(
                searchMode = searchMode,
                searchQuery = searchQuery,
                selectedFilter = selectedFilter,
                activeCount = conversations.count { !it.isArchived },
                archivedCount = conversations.count { it.isArchived },
                unreadCount = conversations.sumOf { it.unreadCount },
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
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(filteredConversations, key = { it.id }) { conversation ->
                            val dismissState = rememberSwipeToDismissBoxState(
                                confirmValueChange = { value ->
                                    if (value == SwipeToDismissBoxValue.EndToStart && !conversation.isArchived) {
                                        onArchiveConversation(conversation.id)
                                    }
                                    false
                                }
                            )

                            SwipeToDismissBox(
                                state = dismissState,
                                enableDismissFromStartToEnd = false,
                                backgroundContent = {
                                    ArchiveSwipeBackground(
                                        archived = conversation.isArchived,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                },
                                content = {
                                    ConversationItem(
                                        conversation = conversation,
                                        baseUrl = baseUrl,
                                        authToken = authToken,
                                        onClick = { onConversationClick(conversation.id) },
                                    )
                                },
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
            ExtendedFloatingActionButton(
            onClick = {
                showCreateDialog = true
                onLoadUsers(false)
            },
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 6.dp),
        ) {
            Icon(Icons.Default.Add, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Новый чат")
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
    unreadCount: Int,
    onSearchModeChange: (Boolean) -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onFilterChange: (ConversationListFilter) -> Unit,
    onCreateClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .animateContentSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
            tonalElevation = 1.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Box(
                modifier = Modifier.background(
                    Brush.linearGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.surface.copy(alpha = 0.98f),
                            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.18f),
                            MaterialTheme.colorScheme.surface.copy(alpha = 0.98f),
                        )
                    )
                )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (searchMode) {
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = onSearchQueryChange,
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = { Text("Поиск чатов и сообщений") },
                            leadingIcon = {
                                Icon(Icons.Default.Search, contentDescription = null)
                            },
                            trailingIcon = {
                                if (searchQuery.isNotBlank()) {
                                    IconButton(onClick = { onSearchQueryChange("") }) {
                                        Icon(Icons.Default.Close, contentDescription = "Очистить")
                                    }
                                } else {
                                    IconButton(onClick = { onSearchModeChange(false) }) {
                                        Icon(Icons.Default.Close, contentDescription = "Закрыть поиск")
                                    }
                                }
                            },
                            singleLine = true,
                            shape = RoundedCornerShape(24.dp),
                        )
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(999.dp),
                                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                                ) {
                                    Text(
                                        text = if (unreadCount > 0) {
                                            "$unreadCount непрочитанных"
                                        } else {
                                            "Все диалоги под рукой"
                                        },
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                    )
                                }

                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        text = "Чаты",
                                        style = MaterialTheme.typography.headlineSmall,
                                        fontWeight = FontWeight.SemiBold,
                                        color = MaterialTheme.colorScheme.onBackground,
                                    )
                                    Text(
                                        text = "Личные диалоги, рабочие группы и переписка по заявкам.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }

                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                ConversationHeaderAction(
                                    onClick = { onSearchModeChange(true) },
                                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                                    contentColor = MaterialTheme.colorScheme.onSurface,
                                    borderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f),
                                ) {
                                    Icon(Icons.Default.Search, contentDescription = "Поиск")
                                }
                                ConversationHeaderAction(
                                    onClick = onCreateClick,
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary,
                                ) {
                                    Icon(Icons.Default.Add, contentDescription = "Новый чат")
                                }
                            }
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.26f),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(6.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            ConversationFilterToggle(
                                title = "Активные",
                                count = activeCount,
                                selected = selectedFilter == ConversationListFilter.ACTIVE,
                                onClick = { onFilterChange(ConversationListFilter.ACTIVE) },
                                modifier = Modifier.weight(1f),
                            )
                            ConversationFilterToggle(
                                title = "Архив",
                                count = archivedCount,
                                selected = selectedFilter == ConversationListFilter.ARCHIVED,
                                onClick = { onFilterChange(ConversationListFilter.ARCHIVED) },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        }

        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
            tonalElevation = 0.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                HeaderMetric(
                    title = "Активные",
                    value = activeCount.toString(),
                    modifier = Modifier.weight(1f),
                )
                HeaderMetric(
                    title = "Непрочитанные",
                    value = unreadCount.toString(),
                    modifier = Modifier.weight(1f),
                )
                HeaderMetric(
                    title = "Всего",
                    value = (activeCount + archivedCount).toString(),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun ConversationHeaderAction(
    onClick: () -> Unit,
    containerColor: Color,
    contentColor: Color,
    borderColor: Color = Color.Transparent,
    content: @Composable () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = containerColor,
        contentColor = contentColor,
        border = BorderStroke(1.dp, borderColor),
    ) {
        Box(
            modifier = Modifier.size(42.dp),
            contentAlignment = Alignment.Center,
        ) {
            content()
        }
    }
}

@Composable
private fun ConversationFilterToggle(
    title: String,
    count: Int,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        color = if (selected) {
            MaterialTheme.colorScheme.primary
        } else {
            Color.Transparent
        },
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelLarge,
                color = if (selected) {
                    MaterialTheme.colorScheme.onPrimary
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
            )
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = if (selected) {
                    MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.18f)
                } else {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.08f)
                },
            ) {
                Text(
                    text = count.toString(),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (selected) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
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
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val cardScale by animateFloatAsState(
        targetValue = if (isPressed) 0.985f else 1f,
        animationSpec = spring(dampingRatio = 0.72f, stiffness = 520f),
        label = "conversationCardScale",
    )
    val cardOffsetY by animateFloatAsState(
        targetValue = if (isPressed) 2f else 0f,
        animationSpec = spring(dampingRatio = 0.85f, stiffness = 650f),
        label = "conversationCardOffsetY",
    )
    val conversationTypeLabel = when (conversation.type) {
        ConversationType.DIRECT -> "Личный"
        ConversationType.GROUP -> "Группа"
        ConversationType.TASK -> "Заявка"
        ConversationType.ORG_GENERAL -> "Орг"
    }
    val conversationTypeColor = when (conversation.type) {
        ConversationType.DIRECT -> MaterialTheme.colorScheme.primaryContainer
        ConversationType.GROUP -> MaterialTheme.colorScheme.secondaryContainer
        ConversationType.TASK -> MaterialTheme.colorScheme.tertiaryContainer
        ConversationType.ORG_GENERAL -> MaterialTheme.colorScheme.surfaceVariant
    }
    val conversationTypeContentColor = when (conversation.type) {
        ConversationType.DIRECT -> MaterialTheme.colorScheme.onPrimaryContainer
        ConversationType.GROUP -> MaterialTheme.colorScheme.onSecondaryContainer
        ConversationType.TASK -> MaterialTheme.colorScheme.onTertiaryContainer
        ConversationType.ORG_GENERAL -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val cardBrush = when {
        conversation.isArchived -> Brush.linearGradient(
            listOf(
                MaterialTheme.colorScheme.surface.copy(alpha = 0.98f),
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.18f),
            )
        )
        isUnread -> Brush.linearGradient(
            listOf(
                MaterialTheme.colorScheme.surface.copy(alpha = 0.98f),
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.18f),
            )
        )
        else -> Brush.linearGradient(
            listOf(
                MaterialTheme.colorScheme.surface.copy(alpha = 0.98f),
                MaterialTheme.colorScheme.surface.copy(alpha = 0.98f),
            )
        )
    }
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

    Card(
        onClick = onClick,
        interactionSource = interactionSource,
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.98f),
        ),
        border = BorderStroke(
            width = if (isUnread) 1.dp else 0.5.dp,
            color = if (isUnread) {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
            } else {
                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)
            },
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = if (isUnread) 3.dp else 1.dp),
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize()
            .graphicsLayer {
                scaleX = cardScale
                scaleY = cardScale
                translationY = cardOffsetY
            },
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(cardBrush)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.80f),
                    border = BorderStroke(
                        width = if (isUnread) 1.5.dp else 1.dp,
                        color = if (isUnread) {
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.20f)
                        } else {
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)
                        },
                    ),
                ) {
                    ChatAvatar(
                        name = title,
                        id = conversation.id,
                        type = conversation.type,
                        avatarUrl = conversation.avatarUrl,
                        baseUrl = baseUrl,
                        authToken = authToken,
                        size = 50,
                    )
                }

                Spacer(Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = conversationTypeColor,
                        ) {
                            Text(
                                text = conversationTypeLabel,
                                style = MaterialTheme.typography.labelSmall,
                                color = conversationTypeContentColor,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            )
                        }
                        if (conversation.taskId != null) {
                            Spacer(Modifier.width(6.dp))
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.75f),
                            ) {
                                Text(
                                    text = "#${conversation.taskId}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(8.dp))

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleSmall.copy(
                                fontWeight = if (isUnread) FontWeight.SemiBold else FontWeight.Medium,
                            ),
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )

                        if (conversation.isMuted) {
                            Spacer(Modifier.width(6.dp))
                            Icon(
                                imageVector = Icons.Default.Notifications,
                                contentDescription = "Без звука",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp),
                            )
                        }

                        if (preview != null) {
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = formatChatTime(preview.createdAt),
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isUnread) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                    }

                    Spacer(Modifier.height(6.dp))

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
                            Spacer(Modifier.width(10.dp))
                            BadgedBox(
                                badge = {
                                    Badge(
                                        containerColor = if (conversation.isMuted) {
                                            MaterialTheme.colorScheme.onSurfaceVariant
                                        } else {
                                            MaterialTheme.colorScheme.primary
                                        },
                                    ) {
                                        Text(
                                            text = if (conversation.unreadCount > 99) "99+" else conversation.unreadCount.toString(),
                                            style = MaterialTheme.typography.labelSmall,
                                        )
                                    }
                                },
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(1.dp)
                                        .background(Color.Transparent),
                                )
                            }
                        }
                    }

                    if (conversation.isArchived) {
                        Spacer(Modifier.height(10.dp))
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.70f),
                        ) {
                            Text(
                                text = "В архиве",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HeaderMetric(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = title,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
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
    val title = when {
        isSearching -> "Ничего не найдено"
        selectedFilter == ConversationListFilter.ARCHIVED -> "Архив пуст"
        else -> "Пока нет чатов"
    }
    val description = when {
        isSearching -> "Попробуйте изменить запрос или очистить поиск."
        selectedFilter == ConversationListFilter.ARCHIVED -> "Архивированные диалоги появятся здесь."
        else -> "Создайте первый диалог или начните обсуждение с коллегой."
    }

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Card(
            shape = RoundedCornerShape(30.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
            ),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
            modifier = Modifier.padding(horizontal = 24.dp),
        ) {
            Box(
                modifier = Modifier.background(
                    Brush.linearGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.surface.copy(alpha = 0.98f),
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.05f),
                            MaterialTheme.colorScheme.tertiary.copy(alpha = 0.06f),
                        )
                    )
                )
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 22.dp, vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(68.dp)
                            .clip(RoundedCornerShape(22.dp))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Default.Email,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(30.dp),
                        )
                    }

                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )

                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    if (isSearching) {
                        TextButton(onClick = onClearSearch) {
                            Text("Очистить поиск")
                        }
                    } else {
                        Button(onClick = onCreateClick) {
                            Icon(Icons.Default.Add, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Новый чат")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ArchiveSwipeBackground(
    archived: Boolean,
    modifier: Modifier = Modifier,
) {
    val backgroundColor = if (archived) {
        MaterialTheme.colorScheme.surfaceVariant
    } else {
        MaterialTheme.colorScheme.secondaryContainer
    }

    Box(
        modifier = modifier,
        contentAlignment = Alignment.CenterEnd,
    ) {
        Surface(
            color = backgroundColor,
            shape = RoundedCornerShape(22.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_download),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = if (archived) "Архив" else "В архив",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
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
