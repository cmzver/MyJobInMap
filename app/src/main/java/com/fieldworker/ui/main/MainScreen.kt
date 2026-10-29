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
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.paging.compose.collectAsLazyPagingItems
import com.fieldworker.ui.addresses.MyAddressesScreen
import com.fieldworker.ui.chat.ChatScreen
import com.fieldworker.ui.chat.ChatViewModel
import com.fieldworker.ui.chat.ConversationListScreen
import com.fieldworker.ui.components.FailedActionsDialog
import com.fieldworker.ui.components.OfflineBanner
import com.fieldworker.ui.components.PhotoUploadConfirmDialog
import com.fieldworker.ui.list.TaskAssignmentUi
import com.fieldworker.ui.list.TaskListScreen
import com.fieldworker.ui.map.MapScreen
import com.fieldworker.ui.map.MapViewModel
import com.fieldworker.ui.navigation.Screen
import com.fieldworker.ui.objectcard.ObjectDetailsScreen
import com.fieldworker.ui.settings.DeveloperScreen
import com.fieldworker.ui.settings.SettingsScreen
import com.fieldworker.ui.settings.UserSettingsScreen
import kotlinx.coroutines.launch

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
    notificationChatId: Long? = null,
    notificationChatMessageId: Long? = null,
    onNotificationChatHandled: () -> Unit = {},
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
    var showSendTaskToChat by remember { mutableStateOf(false) }
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val filteredTasks by viewModel.filteredTasks.collectAsStateWithLifecycle()

    // Фоновые опросы (health) — только пока приложение видно
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> viewModel.setAppInForeground(true)
                Lifecycle.Event.ON_STOP -> viewModel.setAppInForeground(false)
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
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
        Screen.MyAddresses.route -> Screen.MyAddresses
        // Без этой ветки профиль считался «Картой»: над ним рисовались шапка
        // «Карта выездов» и нижняя панель
        Screen.UserSettings.route -> Screen.UserSettings
        else -> Screen.Map
    }
    val unreadChatCount = remember(chatListState.conversations) {
        chatListState.conversations.sumOf { it.unreadCount }
    }
    val topTitle = mainTitleFor(currentScreen, canManageTasks = uiState.canManageTasks)
    val isChatConversationOpen = remember(currentScreen, chatState.conversationId) {
        currentScreen == Screen.Chat && chatState.conversationId != null
    }
    
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
                chatViewModel.attachPhoto(it)
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
    
    // Нижняя навигация: разделы — одно касание под большим пальцем (раньше
    // два касания через бургер в верхнем углу). Во вложенных экранах её нет.
    val showBottomBar = currentScreen in Screen.bottomNavItems && !isChatConversationOpen
    // Единый верхний бар (заголовок) — только для экранов без своей шапки.
    val showUnifiedTopBar = currentScreen == Screen.Map || currentScreen == Screen.TaskList
    val navigateTab: (String) -> Unit = { route ->
        navController.navigate(route) {
            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

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
    
    LaunchedEffect(notificationChatId, notificationChatMessageId) {
        val chatId = notificationChatId ?: return@LaunchedEffect
        navController.navigate(Screen.Chat.route) {
            popUpTo(navController.graph.findStartDestination().id) {
                saveState = true
            }
            launchSingleTop = true
            restoreState = true
        }
        chatViewModel.openConversation(chatId, notificationChatMessageId)
        onNotificationChatHandled()
    }
    
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            if (showBottomBar) {
                AppBottomBar(
                    currentScreen = currentScreen,
                    newTasksCount = uiState.newTasksCount,
                    unreadChatCount = unreadChatCount,
                    onSelect = { navigateTab(it.route) },
                )
            }
        },
        topBar = {
            if (showUnifiedTopBar) {
                TopAppBar(
                    title = {
                        Text(
                            text = topTitle,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold
                        )
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.background
                    )
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
        Column(modifier = Modifier.fillMaxSize()) {
            if (uiState.showFailedActions) {
                FailedActionsDialog(
                    actions = uiState.failedActions,
                    onRetry = { viewModel.retryFailedAction(it) },
                    onDiscard = { viewModel.discardFailedAction(it) },
                    onDismiss = { viewModel.hideFailedActions() }
                )
            }

            Box(modifier = Modifier.weight(1f)) {
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
                        tasks = filteredTasks,
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
                        onPlannedDateChange = { taskId, date -> viewModel.updatePlannedDate(taskId, date) },
                        // Диспетчер/админ
                        taskScope = uiState.taskScope.takeIf { uiState.canManageTasks },
                        onTaskScopeChange = { viewModel.setTaskScope(it) },
                        assignment = if (uiState.canAssignTasks) {
                            TaskAssignmentUi(
                                showDialog = uiState.showAssignDialog,
                                workers = uiState.workers,
                                isLoadingWorkers = uiState.isLoadingWorkers,
                                isAssigning = uiState.isAssigning,
                                onOpen = { viewModel.showAssignDialog() },
                                onDismiss = { viewModel.hideAssignDialog() },
                                onAssign = { taskId, userId -> viewModel.assignTask(taskId, userId) },
                            )
                        } else {
                            null
                        }
                    )
                }
                
                composable(Screen.Chat.route) {
                    val listState by chatViewModel.listState.collectAsStateWithLifecycle()
                    val currentUserId = viewModel.preferences.getUserId()
                    val currentUsername = viewModel.preferences.getUsername()
                    val currentUserFullName = viewModel.preferences.getUserFullName()

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
                            messageSendStatuses = chatState.messageSendStatuses,
                            messageSendErrors = chatState.messageSendErrors,
                            pinnedMessageIds = chatState.pinnedMessageIds,
                            recipientCount = recipientCount,
                            availableUsers = listState.availableUsers,
                            isLoadingUsers = listState.isLoadingUsers,
                            baseUrl = baseUrl,
                            authToken = authToken,
                            isMuted = chatState.detail?.members?.firstOrNull { it.userId == currentUserId }?.isMuted == true,
                            isArchived = listState.conversations
                                .firstOrNull { it.id == chatState.conversationId }?.isArchived
                                ?: chatState.detail?.members?.firstOrNull { it.userId == currentUserId }?.isArchived
                                ?: false,
                            isSavingConversation = chatState.isSavingConversation,
                            activeManagementUserId = chatState.activeManagementUserId,
                            currentUserId = currentUserId,
                            currentUsername = currentUsername,
                            currentUserFullName = currentUserFullName,
                            onBack = { chatViewModel.closeConversation() },
                            onLoadUsers = { force -> chatViewModel.loadAvailableUsers(force) },
                            onToggleMute = { chatViewModel.toggleConversationMute() },
                            onToggleArchive = {
                                val isArchived = listState.conversations
                                    .firstOrNull { it.id == chatState.conversationId }?.isArchived
                                    ?: chatState.detail?.members?.firstOrNull { it.userId == currentUserId }?.isArchived
                                    ?: false
                                chatViewModel.toggleConversationArchive(isArchived)
                            },
                            onRenameConversation = { chatViewModel.renameCurrentConversation(it) },
                            onAddMembers = { chatViewModel.addConversationMembers(it) },
                            onRemoveMember = { chatViewModel.removeConversationMember(it) },
                            onUpdateMemberRole = { userId, role -> chatViewModel.updateConversationMemberRole(userId, role) },
                            onTransferOwnership = { chatViewModel.transferConversationOwnership(it) },
                            onSendMessage = { chatViewModel.sendMessage(it) },
                            onAttachFile = { chatAttachmentLauncher.launch("image/*") },
                            onCancelAttachment = { chatViewModel.cancelAttachment() },
                            pendingAttachmentUri = chatState.pendingAttachmentUri,
                            onMessageInputChanged = { chatViewModel.onMessageInputChanged(it) },
                            onLoadMore = { chatViewModel.loadMoreMessages() },
                            onDeleteMessage = { chatViewModel.deleteMessage(it) },
                            onRetryMessage = { chatViewModel.retryMessage(it) },
                            onTogglePinnedMessage = { chatViewModel.togglePinnedMessage(it) },
                            onToggleReaction = { msgId, emoji -> chatViewModel.toggleReaction(msgId, emoji) },
                            onSetReplyTo = { chatViewModel.setReplyTo(it) },
                            onOpenAttachment = { chatViewModel.openAttachment(it) },
                            onVisibleMessagesRead = { chatViewModel.markVisibleMessagesAsRead(it) },
                            onUnreadAnchorConsumed = { chatViewModel.consumeUnreadAnchor() },
                            availableTasks = chatViewModel.availableTasks.collectAsStateWithLifecycle().value,
                            pendingAttachedTask = chatState.pendingAttachedTask,
                            onAttachTask = { chatViewModel.attachTask(it) },
                            onCancelAttachedTask = { chatViewModel.clearAttachedTask() },
                            onOpenTask = { taskId ->
                                // Открываем существующий экран заявки (TaskDetailBottomSheet в
                                // списке) — там уже есть комментарии, фото, смена статуса и т.д.
                                viewModel.openTaskFromNotification(taskId)
                                navController.navigate(Screen.TaskList.route)
                            },
                        )
                    } else {
                        ConversationListScreen(
                            conversations = listState.conversations,
                            selectedFilter = listState.selectedFilter,
                            currentUserId = currentUserId,
                            availableUsers = listState.availableUsers,
                            isLoading = listState.isLoading,
                            isLoadingUsers = listState.isLoadingUsers,
                            baseUrl = baseUrl,
                            authToken = authToken,
                            isCreatingConversation = listState.isCreatingConversation,
                            onConversationClick = { chatViewModel.openConversation(it) },
                            onFilterChange = { chatViewModel.setConversationListFilter(it) },
                            onLoadUsers = { force -> chatViewModel.loadAvailableUsers(force) },
                            onCreateDirectConversation = { chatViewModel.createDirectConversation(it) },
                            onCreateGroupConversation = { name, userIds -> chatViewModel.createGroupConversation(name, userIds) },
                            onRefresh = { chatViewModel.loadConversations() },
                        )
                    }
                    }
                }
                
                composable(Screen.Settings.route) {
                    SettingsScreen(
                        preferences = viewModel.preferences,
                        onTestConnection = { url -> viewModel.testConnection(url) },
                        connectionStatus = connectionStatus,
                        onCheckForUpdates = onCheckForUpdates,
                        isCheckingForUpdates = isCheckingForUpdates,
                        onOpenDeveloperScreen = {
                            navController.navigate(Screen.Developer.route)
                        },
                        onOpenUserSettings = {
                            navController.navigate(Screen.UserSettings.route)
                        },
                        baseUrl = baseUrl,
                        authToken = authToken,
                        onLogout = { showLogoutDialog = true },
                        onOpenMyAddresses = {
                            navController.navigate(Screen.MyAddresses.route) { launchSingleTop = true }
                        }
                    )
                }

                composable(Screen.Developer.route) {
                    DeveloperScreen(
                        preferences = viewModel.preferences,
                        onBack = { navController.popBackStack() }
                    )
                }

                composable(Screen.UserSettings.route) {
                    UserSettingsScreen(
                        baseUrl = baseUrl,
                        authToken = authToken,
                        onBack = { navController.popBackStack() }
                    )
                }

                composable(Screen.ObjectCard.route) {
                    ObjectDetailsScreen(
                        task = uiState.selectedTask,
                        addressDetails = uiState.addressDetails,
                        isLoading = uiState.isLoadingAddress,
                        hasAttemptedLookup = uiState.hasAttemptedAddressLookup,
                        onBack = { navController.popBackStack() },
                        onSendToChat = { showSendTaskToChat = true },
                        comments = uiState.comments,
                    )
                }

                composable(Screen.MyAddresses.route) {
                    MyAddressesScreen(onBack = { navController.popBackStack() })
                }
            }
            } // Box(weight)
            // Баннер офлайна/неотправленного — всегда над нижней панелью: у экранов
            // со своей шапкой (чаты, «Ещё») он раньше оказывался над заголовком.
            OfflineBanner(
                isOffline = uiState.isOffline,
                pendingActionsCount = uiState.pendingActionsCount,
                onSyncClick = { viewModel.forceSync() },
                failedActionsCount = uiState.failedActions.size,
                onReviewFailed = { viewModel.showFailedActions() }
            )
        } // Column

        // Диалог «Отправить заявку в чат» из карточки объекта
        if (showSendTaskToChat) {
            val taskToSend = uiState.selectedTask
            AlertDialog(
                onDismissRequest = { showSendTaskToChat = false },
                icon = { Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null) },
                title = { Text("Отправить заявку в чат") },
                text = {
                    if (chatListState.conversations.isEmpty()) {
                        Text("Нет доступных чатов")
                    } else {
                        androidx.compose.foundation.lazy.LazyColumn(
                            modifier = Modifier.heightIn(max = 360.dp)
                        ) {
                            items(chatListState.conversations, key = { it.id }) { conv ->
                                Text(
                                    text = conv.displayName ?: conv.name ?: "Чат #${conv.id}",
                                    style = MaterialTheme.typography.bodyLarge,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            taskToSend?.let {
                                                chatViewModel.sendTaskToConversation(conv.id, it.id)
                                            }
                                            showSendTaskToChat = false
                                        }
                                        .padding(vertical = 12.dp),
                                )
                            }
                        }
                    }
                },
                confirmButton = {},
                dismissButton = {
                    TextButton(onClick = { showSendTaskToChat = false }) { Text("Отмена") }
                },
            )
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

private fun mainTitleFor(screen: Screen, canManageTasks: Boolean): String {
    return when (screen) {
        Screen.Map -> "Карта выездов"
        // Диспетчер/админ видит все заявки организации, а не только свои
        Screen.TaskList -> if (canManageTasks) "Заявки" else "Мои заявки"
        Screen.Chat -> "Чаты"
        Screen.Settings -> "Настройки и профиль"
        Screen.Developer -> "Режим разработчика"
        Screen.ObjectCard -> "Карточка объекта"
        Screen.UserSettings -> "Профиль пользователя"
        Screen.MyAddresses -> "Мои адреса"
    }
}

/**
 * Нижняя навигация: четыре раздела, счётчики новых заявок и непрочитанных
 * чатов видны всегда. «Ещё» подсвечен и во вложенных разделах настроек.
 */
@Composable
internal fun AppBottomBar(
    currentScreen: Screen,
    newTasksCount: Int,
    unreadChatCount: Int,
    onSelect: (Screen) -> Unit,
) {
    Column {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
        NavigationBar(
            containerColor = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
        ) {
            Screen.bottomNavItems.forEach { screen ->
                val badge = when (screen) {
                    Screen.TaskList -> newTasksCount
                    Screen.Chat -> unreadChatCount
                    else -> 0
                }
                NavigationBarItem(
                    selected = currentScreen == screen,
                    onClick = { onSelect(screen) },
                    icon = {
                        BadgedBox(
                            badge = {
                                if (badge > 0) {
                                    Badge(
                                        containerColor = MaterialTheme.colorScheme.primary,
                                        contentColor = MaterialTheme.colorScheme.onPrimary,
                                    ) { Text(if (badge > 99) "99+" else "$badge") }
                                }
                            }
                        ) {
                            screen.icon?.let { Icon(it, contentDescription = null) }
                        }
                    },
                    label = { Text(screen.label, style = MaterialTheme.typography.labelMedium) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.primary,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                )
            }
        }
    }
}

