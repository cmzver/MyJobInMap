package com.fieldworker.ui.main

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.paging.compose.collectAsLazyPagingItems
import com.fieldworker.ui.components.PhotoUploadConfirmDialog
import com.fieldworker.ui.chat.ChatViewModel
import com.fieldworker.ui.chat.ChatScreen
import com.fieldworker.ui.chat.ConversationListFilter
import com.fieldworker.ui.chat.ConversationListScreen
import com.fieldworker.ui.list.TaskListScreen
import com.fieldworker.ui.map.MapScreen
import com.fieldworker.ui.map.MapViewModel
import com.fieldworker.ui.navigation.Screen
import com.fieldworker.ui.objectcard.ObjectDetailsScreen
import com.fieldworker.ui.settings.ConnectionStatus
import com.fieldworker.ui.settings.DeveloperScreen
import com.fieldworker.ui.settings.SettingsScreen

/**
 * Главный экран приложения с Navigation Compose.
 * 
 * Использует NavHost для переключения между табами:
 * - Карта (MapScreen)
 * - Список заявок (TaskListScreen)
 * - Настройки (SettingsScreen)
 * - Экран разработчика (DeveloperScreen) — отдельный destination
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    notificationTaskId: Long? = null,
    onNotificationTaskHandled: () -> Unit = {},
    onLogout: () -> Unit = {},
    onCheckForUpdates: () -> Unit = {},
    isCheckingForUpdates: Boolean = false,
    viewModel: MapViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val navController = rememberNavController()
    val chatViewModel: ChatViewModel = hiltViewModel()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    
    var showLogoutDialog by remember { mutableStateOf(false) }
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val chatListState by chatViewModel.listState.collectAsStateWithLifecycle()
    val chatState by chatViewModel.chatState.collectAsStateWithLifecycle()
    val pagingItems = viewModel.tasksPagingFlow.collectAsLazyPagingItems()
    val snackbarHostState = remember { SnackbarHostState() }
    val connectionStatus by viewModel.connectionStatus.collectAsStateWithLifecycle()
    val currentScreen = when (currentRoute) {
        Screen.TaskList.route -> Screen.TaskList
        Screen.Chat.route -> Screen.Chat
        Screen.Settings.route -> Screen.Settings
        Screen.Developer.route -> Screen.Developer
        Screen.ObjectCard.route -> Screen.ObjectCard
        else -> Screen.Map
    }
    val unreadChatCount = remember(chatListState.conversations) {
        chatListState.conversations.sumOf { it.unreadCount }
    }
    val topTitle = mainTitleFor(currentScreen)
    val topSubtitle = mainSubtitleFor(currentScreen, uiState.newTasksCount, connectionStatus)
    
    // Получаем baseUrl из preferences (полный URL с портом)
    val baseUrl = viewModel.preferences.getFullServerUrl()
    val authToken = viewModel.preferences.getAuthToken()
    
    // Состояние для выбранного фото (перед подтверждением загрузки)
    var selectedPhotoUri by remember { mutableStateOf<Uri?>(null) }
    
    // Сбрасываем selectedPhotoUri когда загрузка завершилась
    LaunchedEffect(uiState.isUploadingPhoto) {
        if (!uiState.isUploadingPhoto && selectedPhotoUri != null) {
            // Проверяем, не было ли ошибки
            if (uiState.error == null) {
                selectedPhotoUri = null
            }
        }
    }
    
    // Image picker для загрузки фото (теперь сохраняем Uri, не загружаем сразу)
    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
        onResult = { uri: Uri? ->
            uri?.let {
                selectedPhotoUri = it
            }
        }
    )

    val chatAttachmentLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
        onResult = { uri: Uri? ->
            uri?.let {
                chatViewModel.sendAttachment(it)
            }
        }
    )
    
    // Показываем ошибки в Snackbar
    LaunchedEffect(uiState.error) {
        uiState.error?.let { error ->
            snackbarHostState.showSnackbar(error)
            viewModel.clearError()
        }
    }

    LaunchedEffect(chatState.error) {
        chatState.error?.let { error ->
            snackbarHostState.showSnackbar(error)
            chatViewModel.clearError()
        }
    }

    LaunchedEffect(chatViewModel) {
        chatViewModel.notifications.collect { message ->
            snackbarHostState.showSnackbar(message)
        }
    }

    LaunchedEffect(chatViewModel, context) {
        chatViewModel.attachmentOpenEvents.collect { attachment ->
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(attachment.uri, attachment.mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            runCatching {
                context.startActivity(Intent.createChooser(intent, attachment.fileName))
            }.onFailure {
                snackbarHostState.showSnackbar("Нет приложения для открытия файла")
            }
        }
    }
    
    // Показываем успешное обновление
    LaunchedEffect(uiState.statusUpdateSuccess) {
        if (uiState.statusUpdateSuccess) {
            snackbarHostState.showSnackbar("Статус обновлён")
            viewModel.clearStatusUpdateSuccess()
        }
    }
    
    val showMainTopBar = currentScreen != Screen.Map && currentScreen != Screen.TaskList && currentScreen != Screen.Chat && currentScreen != Screen.Developer && currentScreen != Screen.ObjectCard
    val showBottomBar = currentScreen != Screen.Developer && currentScreen != Screen.ObjectCard

    LaunchedEffect(notificationTaskId) {
        val taskId = notificationTaskId ?: return@LaunchedEffect
        navController.navigate(Screen.TaskList.route) {
            popUpTo(navController.graph.findStartDestination().id) {
                saveState = true
            }
            launchSingleTop = true
            restoreState = true
        }
        viewModel.openTaskFromNotification(taskId)
        onNotificationTaskHandled()
    }
    
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            if (showMainTopBar) {
                Surface(
                    color = MaterialTheme.colorScheme.background
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .statusBarsPadding()
                            .padding(horizontal = 20.dp, vertical = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = topTitle,
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = MaterialTheme.colorScheme.surface,
                            tonalElevation = 1.dp,
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                MaterialTheme.colorScheme.outlineVariant
                            )
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = connectionStatusIcon(connectionStatus),
                                    contentDescription = null,
                                    tint = connectionStatusTint(connectionStatus),
                                    modifier = Modifier.size(16.dp)
                                )
                                Text(
                                    text = topSubtitle,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        },
        bottomBar = {
            if (showBottomBar) {
                Surface(
                    color = MaterialTheme.colorScheme.background
                ) {
                    NavigationBar(
                        modifier = Modifier
                            .padding(horizontal = 12.dp, vertical = 10.dp)
                            .navigationBarsPadding(),
                        containerColor = MaterialTheme.colorScheme.surface,
                        tonalElevation = 0.dp
                    ) {
                        Screen.bottomNavItems.forEach { screen ->
                            NavigationBarItem(
                                icon = {
                                    if (screen == Screen.TaskList || screen == Screen.Chat) {
                                        BadgedBox(
                                            badge = {
                                                val badgeCount = when (screen) {
                                                    Screen.TaskList -> uiState.newTasksCount
                                                    Screen.Chat -> unreadChatCount
                                                    else -> 0
                                                }

                                                if (badgeCount > 0) {
                                                    Badge(
                                                        containerColor = MaterialTheme.colorScheme.error
                                                    ) {
                                                        Text(if (badgeCount > 99) "99+" else "$badgeCount")
                                                    }
                                                }
                                            }
                                        ) {
                                            Icon(
                                                screen.icon!!,
                                                contentDescription = null,
                                                modifier = Modifier.size(24.dp)
                                            )
                                        }
                                    } else {
                                        Icon(
                                            screen.icon!!,
                                            contentDescription = null,
                                            modifier = Modifier.size(24.dp)
                                        )
                                    }
                                },
                                label = {
                                    Text(
                                        screen.label,
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                },
                                selected = currentRoute == screen.route,
                                onClick = {
                                    navController.navigate(screen.route) {
                                        popUpTo(navController.graph.findStartDestination().id) {
                                            saveState = true
                                        }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = MaterialTheme.colorScheme.primary,
                                    selectedTextColor = MaterialTheme.colorScheme.primary,
                                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            )
                        }
                    }
                }
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            NavHost(
                navController = navController,
                startDestination = Screen.Map.route
            ) {
                composable(Screen.Map.route) {
                    MapScreen(
                        viewModel = viewModel,
                        onOpenObjectCard = {
                            navController.navigate(Screen.ObjectCard.route)
                        }
                    )
                }
                
                composable(Screen.TaskList.route) {
                    TaskListScreen(
                        tasks = uiState.filteredTasks,
                        comments = uiState.comments,
                        isLoading = uiState.isLoading,
                        isLoadingComments = uiState.isLoadingComments,
                        selectedTask = uiState.selectedTask,
                        addressDetails = uiState.addressDetails,
                        isLoadingAddress = uiState.isLoadingAddress,
                        hasAttemptedAddressLookup = uiState.hasAttemptedAddressLookup,
                        showStatusDialog = uiState.showStatusDialog,
                        onRefresh = { viewModel.loadTasks() },
                        onTaskClick = { task -> viewModel.selectTask(task) },
                        onTaskDismiss = { viewModel.selectTask(null) },
                        onStatusChange = { viewModel.showStatusDialog() },
                        onHideStatusDialog = { viewModel.hideStatusDialog() },
                        onStatusSelected = { taskId: Long, status, comment ->
                            viewModel.updateTaskStatus(taskId, status, comment)
                        },
                        onAddComment = { taskId: Long, text -> viewModel.addComment(taskId, text) },
                        statusFilter = uiState.statusFilter,
                        searchQuery = uiState.searchQuery,
                        onStatusFilterChange = { viewModel.setStatusFilter(it) },
                        onSearchQueryChange = { viewModel.setSearchQuery(it) },
                        sortOrder = uiState.sortOrder,
                        onSortOrderChange = { viewModel.setSortOrder(it) },
                        userLat = uiState.myLocationLat,
                        userLon = uiState.myLocationLon,
                        // Paging 3
                        pagingItems = pagingItems,
                        // Фотографии
                        photos = uiState.photos,
                        isLoadingPhotos = uiState.isLoadingPhotos,
                        isUploadingPhoto = uiState.isUploadingPhoto,
                        baseUrl = baseUrl,
                        authToken = authToken,
                        onOpenObjectCard = {
                            navController.navigate(Screen.ObjectCard.route)
                        },
                        onAddPhotoClick = {
                            photoPickerLauncher.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                            )
                        },
                        onDeletePhoto = { photoId -> viewModel.deletePhoto(photoId) },
                        // Планируемая дата
                        onPlannedDateChange = { taskId, date -> viewModel.updatePlannedDate(taskId, date) }
                    )
                }
                
                composable(Screen.Chat.route) {
                    val listState by chatViewModel.listState.collectAsStateWithLifecycle()
                    val currentUserId = viewModel.preferences.getUserId()

                    AnimatedContent(
                        targetState = chatState.conversationId != null,
                        transitionSpec = {
                            if (targetState) {
                                (fadeIn() + slideInHorizontally { it / 10 }) togetherWith
                                    (fadeOut() + slideOutHorizontally { -it / 14 })
                            } else {
                                (fadeIn() + slideInHorizontally { -it / 10 }) togetherWith
                                    (fadeOut() + slideOutHorizontally { it / 14 })
                            }
                        },
                        label = "chatScreenTransition",
                    ) { isConversationOpen ->
                    if (isConversationOpen) {
                        val typingText = remember(chatState.typingUsers) {
                            val names = chatState.typingUsers.values.toList()
                            when (names.size) {
                                0 -> null
                                1 -> "${names[0]} печатает..."
                                else -> names.take(2).joinToString(", ") + " печатают..."
                            }
                        }
                        val recipientCount = remember(chatState.detail, currentUserId) {
                            (chatState.detail?.members?.count { it.userId != currentUserId } ?: 0)
                        }

                        ChatScreen(
                            title = chatState.detail?.displayName
                                ?: chatState.detail?.name
                                ?: "Чат",
                            conversationDetail = chatState.detail,
                            messages = chatState.messages,
                            hasMore = chatState.hasMore,
                            pendingUnreadAnchorMessageId = chatState.pendingUnreadAnchorMessageId,
                            isPreparingUnreadAnchor = chatState.isPreparingUnreadAnchor,
                            lastReadMessageId = chatState.detail?.members
                                ?.firstOrNull { it.userId == currentUserId }
                                ?.lastReadMessageId,
                            isLoadingMessages = chatState.isLoadingMessages,
                            isSending = chatState.isSending,
                            replyTo = chatState.replyTo,
                            typingText = typingText,
                            readReceipts = chatState.readReceipts,
                            recipientCount = recipientCount,
                            availableUsers = listState.availableUsers,
                            isLoadingUsers = listState.isLoadingUsers,
                            baseUrl = baseUrl,
                            authToken = authToken,
                            isMuted = chatState.detail?.members?.firstOrNull { it.userId == currentUserId }?.isMuted == true,
                            isArchived = chatState.detail?.members?.firstOrNull { it.userId == currentUserId }?.isArchived == true,
                            isSavingConversation = chatState.isSavingConversation,
                            activeManagementUserId = chatState.activeManagementUserId,
                            currentUserId = currentUserId,
                            onBack = { chatViewModel.closeConversation() },
                            onLoadUsers = { force -> chatViewModel.loadAvailableUsers(force) },
                            onToggleMute = { chatViewModel.toggleConversationMute() },
                            onToggleArchive = { chatViewModel.toggleConversationArchive() },
                            onRenameConversation = { chatViewModel.renameCurrentConversation(it) },
                            onAddMembers = { chatViewModel.addConversationMembers(it) },
                            onRemoveMember = { chatViewModel.removeConversationMember(it) },
                            onUpdateMemberRole = { userId, role -> chatViewModel.updateConversationMemberRole(userId, role) },
                            onTransferOwnership = { chatViewModel.transferConversationOwnership(it) },
                            onSendMessage = { chatViewModel.sendMessage(it) },
                            onAttachFile = { chatAttachmentLauncher.launch("*/*") },
                            onMessageInputChanged = { chatViewModel.onMessageInputChanged(it) },
                            onLoadMore = { chatViewModel.loadMoreMessages() },
                            onDeleteMessage = { chatViewModel.deleteMessage(it) },
                            onToggleReaction = { msgId, emoji -> chatViewModel.toggleReaction(msgId, emoji) },
                            onSetReplyTo = { chatViewModel.setReplyTo(it) },
                            onOpenAttachment = { chatViewModel.openAttachment(it) },
                            onVisibleMessagesRead = { chatViewModel.markVisibleMessagesAsRead(it) },
                            onUnreadAnchorConsumed = { chatViewModel.consumeUnreadAnchor() },
                        )
                    } else {
                        ConversationListScreen(
                            conversations = listState.conversations,
                            selectedFilter = listState.selectedFilter,
                            currentUserId = currentUserId,
                            availableUsers = listState.availableUsers,
                            isLoading = listState.isLoading,
                            isLoadingUsers = listState.isLoadingUsers,
                            isCreatingConversation = listState.isCreatingConversation,
                            onConversationClick = { chatViewModel.openConversation(it) },
                            onFilterChange = { chatViewModel.setConversationListFilter(it) },
                            onLoadUsers = { force -> chatViewModel.loadAvailableUsers(force) },
                            onCreateDirectConversation = { chatViewModel.createDirectConversation(it) },
                            onCreateGroupConversation = { name, userIds -> chatViewModel.createGroupConversation(name, userIds) },
                            onRefresh = { chatViewModel.loadConversations() },
                            onArchiveConversation = { chatViewModel.archiveConversationFromList(it) },
                        )
                    }
                    }
                }
                
                composable(Screen.Settings.route) {
                    SettingsScreen(
                        preferences = viewModel.preferences,
                        authRepository = viewModel.authRepository,
                        onTestConnection = { url -> viewModel.testConnection(url) },
                        connectionStatus = connectionStatus,
                        onCheckForUpdates = onCheckForUpdates,
                        isCheckingForUpdates = isCheckingForUpdates,
                        onOpenDeveloperScreen = {
                            navController.navigate(Screen.Developer.route)
                        },
                        onLogout = { showLogoutDialog = true }
                    )
                }
                
                composable(Screen.Developer.route) {
                    DeveloperScreen(
                        preferences = viewModel.preferences,
                        onBack = { navController.popBackStack() }
                    )
                }

                composable(Screen.ObjectCard.route) {
                    ObjectDetailsScreen(
                        task = uiState.selectedTask,
                        addressDetails = uiState.addressDetails,
                        isLoading = uiState.isLoadingAddress,
                        hasAttemptedLookup = uiState.hasAttemptedAddressLookup,
                        onBack = { navController.popBackStack() }
                    )
                }
            }
            
            // Диалог выхода
            if (showLogoutDialog) {
                AlertDialog(
                    onDismissRequest = { showLogoutDialog = false },
                    icon = { Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null) },
                    title = { Text("Выход") },
                    text = { Text("Вы уверены, что хотите выйти из аккаунта?") },
                    confirmButton = {
                        Button(
                            onClick = {
                                showLogoutDialog = false
                                onLogout()
                            }
                        ) {
                            Text("Выйти")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showLogoutDialog = false }) {
                            Text("Отмена")
                        }
                    }
                )
            }
            
            // Диалог подтверждения загрузки фото
            if (selectedPhotoUri != null && uiState.selectedTask != null) {
                PhotoUploadConfirmDialog(
                    photoUri = selectedPhotoUri!!,
                    isUploading = uiState.isUploadingPhoto,
                    onUpload = { photoType ->
                        viewModel.uploadPhoto(uiState.selectedTask!!.id, selectedPhotoUri!!, photoType)
                    },
                    onDismiss = { selectedPhotoUri = null }
                )
            }
        }
    }
}

private fun mainTitleFor(screen: Screen): String {
    return when (screen) {
        Screen.Map -> "Карта выездов"
        Screen.TaskList -> "Мои заявки"
        Screen.Chat -> "Чаты"
        Screen.Settings -> "Настройки и профиль"
        Screen.Developer -> "Режим разработчика"
        Screen.ObjectCard -> "Карточка объекта"
    }
}

private fun mainSubtitleFor(
    screen: Screen,
    newTasksCount: Int,
    connectionStatus: ConnectionStatus
): String {
    return when (screen) {
        Screen.Map -> if (newTasksCount > 0) "$newTasksCount новых заявок ждут обработки" else connectionStatusLabel(connectionStatus)
        Screen.TaskList -> if (newTasksCount > 0) "$newTasksCount новых заявок в очереди" else "Список синхронизирован и готов к работе"
        Screen.Chat -> "Сообщения и обсуждения"
        Screen.Settings -> "Сервер, уведомления, обновления и локальные настройки"
        Screen.Developer -> "Диагностика и служебные параметры приложения"
        Screen.ObjectCard -> "Сведения по адресу, оборудованию и истории объекта"
    }
}

private fun connectionStatusLabel(status: ConnectionStatus): String {
    return when (status) {
        ConnectionStatus.IDLE -> "Последняя синхронизация без ошибок"
        ConnectionStatus.TESTING -> "Проверяем доступность сервера"
        ConnectionStatus.SUCCESS -> "Сервер доступен"
        is ConnectionStatus.ERROR -> status.message
    }
}

private fun connectionStatusIcon(status: ConnectionStatus) = when (status) {
    ConnectionStatus.IDLE, ConnectionStatus.SUCCESS -> Icons.Default.CheckCircle
    ConnectionStatus.TESTING -> Icons.Default.Refresh
    is ConnectionStatus.ERROR -> Icons.Default.Warning
}

@Composable
private fun connectionStatusTint(status: ConnectionStatus) = when (status) {
    ConnectionStatus.IDLE, ConnectionStatus.SUCCESS -> MaterialTheme.colorScheme.primary
    ConnectionStatus.TESTING -> MaterialTheme.colorScheme.tertiary
    is ConnectionStatus.ERROR -> MaterialTheme.colorScheme.error
}
