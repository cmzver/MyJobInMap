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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import com.fieldworker.BuildConfig
import com.fieldworker.ui.theme.AppColors
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.coroutines.launch
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
import com.fieldworker.ui.components.OfflineBanner
import com.fieldworker.ui.components.PhotoUploadConfirmDialog
import com.fieldworker.ui.chat.ChatViewModel
import com.fieldworker.ui.chat.ChatScreen
import com.fieldworker.ui.chat.ConversationListFilter
import com.fieldworker.ui.chat.ConversationListScreen
import com.fieldworker.ui.list.TaskListScreen
import com.fieldworker.ui.map.MapScreen
import com.fieldworker.ui.map.MapViewModel
import com.fieldworker.ui.addresses.MyAddressesScreen
import com.fieldworker.ui.navigation.Screen
import com.fieldworker.ui.objectcard.ObjectDetailsScreen
import com.fieldworker.ui.settings.DeveloperScreen
import com.fieldworker.ui.settings.SettingsScreen
import com.fieldworker.ui.settings.UserSettingsScreen

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
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val drawerScope = rememberCoroutineScope()
    
    var showLogoutDialog by remember { mutableStateOf(false) }
    var showSendTaskToChat by remember { mutableStateOf(false) }
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val filteredTasks by viewModel.filteredTasks.collectAsStateWithLifecycle()
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
        else -> Screen.Map
    }
    val unreadChatCount = remember(chatListState.conversations) {
        chatListState.conversations.sumOf { it.unreadCount }
    }
    val topTitle = mainTitleFor(currentScreen)
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
    
    // Полностью боковая навигация: разделы живут в drawer, нижней панели нет.
    val topLevelScreens = setOf(
        Screen.Map, Screen.TaskList, Screen.Chat, Screen.Settings, Screen.MyAddresses
    )
    val isTopLevel = currentScreen in topLevelScreens && !isChatConversationOpen
    // Единый верхний бар (бургер + заголовок) — только для экранов без своей шапки.
    val showUnifiedTopBar = currentScreen == Screen.Map || currentScreen == Screen.TaskList
    val openDrawer: () -> Unit = { drawerScope.launch { drawerState.open() } }
    val navigateTab: (String) -> Unit = { route ->
        drawerScope.launch { drawerState.close() }
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
    
    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = isTopLevel || drawerState.isOpen,
        drawerContent = {
            AppDrawer(
                userName = viewModel.preferences.getUserFullName()
                    ?: viewModel.preferences.getUsername()
                    ?: "Профиль",
                roleLabel = viewModel.preferences.getUserRoleLabel(),
                currentScreen = currentScreen,
                newTasksCount = uiState.newTasksCount,
                unreadChatCount = unreadChatCount,
                onMap = { navigateTab(Screen.Map.route) },
                onTaskList = { navigateTab(Screen.TaskList.route) },
                onChat = { navigateTab(Screen.Chat.route) },
                onMyAddresses = {
                    drawerScope.launch { drawerState.close() }
                    navController.navigate(Screen.MyAddresses.route) { launchSingleTop = true }
                },
                onSettings = { navigateTab(Screen.Settings.route) },
                onProfile = {
                    drawerScope.launch { drawerState.close() }
                    navController.navigate(Screen.UserSettings.route) { launchSingleTop = true }
                },
            )
        },
    ) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
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
                    navigationIcon = {
                        IconButton(onClick = openDrawer) {
                            Icon(Icons.Default.Menu, contentDescription = "Меню")
                        }
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
            // Баннер офлайн-режима (занимает место сверху, сдвигает контент)
            OfflineBanner(
                isOffline = uiState.isOffline,
                pendingActionsCount = uiState.pendingActionsCount,
                onSyncClick = { viewModel.forceSync() }
            )

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
                        onPlannedDateChange = { taskId, date -> viewModel.updatePlannedDate(taskId, date) }
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
                            onOpenMenu = openDrawer,
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
                        onOpenMenu = openDrawer
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
                    MyAddressesScreen(onOpenDrawer = openDrawer)
                }
            }
            } // Box(weight)
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
    } // ModalNavigationDrawer
}

private fun mainTitleFor(screen: Screen): String {
    return when (screen) {
        Screen.Map -> "Карта выездов"
        Screen.TaskList -> "Мои заявки"
        Screen.Chat -> "Чаты"
        Screen.Settings -> "Настройки и профиль"
        Screen.Developer -> "Режим разработчика"
        Screen.ObjectCard -> "Карточка объекта"
        Screen.UserSettings -> "Профиль пользователя"
        Screen.MyAddresses -> "Мои адреса"
    }
}

@Composable
private fun AppDrawer(
    userName: String,
    roleLabel: String?,
    currentScreen: Screen,
    newTasksCount: Int,
    unreadChatCount: Int,
    onMap: () -> Unit,
    onTaskList: () -> Unit,
    onChat: () -> Unit,
    onMyAddresses: () -> Unit,
    onSettings: () -> Unit,
    onProfile: () -> Unit,
) {
    ModalDrawerSheet(
        modifier = Modifier.width(296.dp),
        drawerContainerColor = MaterialTheme.colorScheme.surface,
        drawerTonalElevation = 0.dp,
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Бренд + профиль (как шапка/лого портала)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .clickable(onClick = onProfile)
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(
                            Brush.linearGradient(
                                listOf(
                                    MaterialTheme.colorScheme.primary,
                                    AppColors.PrimaryDark,
                                )
                            )
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = userName.trim().firstOrNull()?.uppercase() ?: "?",
                        style = MaterialTheme.typography.titleLarge,
                        color = Color.White,
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = userName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                    )
                    if (!roleLabel.isNullOrBlank()) {
                        Text(
                            text = roleLabel,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                    }
                }
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

            Column(modifier = Modifier.padding(vertical = 6.dp)) {
                DrawerSectionTitle("Основное")
                PortalDrawerItem(Screen.Map, currentScreen == Screen.Map, 0, onMap)
                PortalDrawerItem(Screen.TaskList, currentScreen == Screen.TaskList, newTasksCount, onTaskList)
                PortalDrawerItem(Screen.Chat, currentScreen == Screen.Chat, unreadChatCount, onChat)

                DrawerSectionTitle("Управление")
                PortalDrawerItem(Screen.MyAddresses, currentScreen == Screen.MyAddresses, 0, onMyAddresses)

                DrawerSectionTitle("Личное")
                PortalDrawerItem(Screen.Settings, currentScreen == Screen.Settings, 0, onSettings)
                PortalDrawerItem(Screen.UserSettings, currentScreen == Screen.UserSettings, 0, onProfile)
            }

            Spacer(modifier = Modifier.weight(1f))

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Text(
                text = "FieldWorker • v${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .navigationBarsPadding()
                    .padding(horizontal = 24.dp, vertical = 12.dp),
            )
        }
    }
}

@Composable
private fun DrawerSectionTitle(title: String) {
    Text(
        text = title.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        letterSpacing = 0.8.sp,
        modifier = Modifier.padding(start = 28.dp, end = 16.dp, top = 10.dp, bottom = 4.dp),
    )
}

@Composable
private fun PortalDrawerItem(
    screen: Screen,
    selected: Boolean,
    badge: Int,
    onClick: () -> Unit,
) {
    val accent = MaterialTheme.colorScheme.primary
    val bg = if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent
    val contentColor = if (selected) accent else MaterialTheme.colorScheme.onSurface
    val iconColor = if (selected) accent else MaterialTheme.colorScheme.onSurfaceVariant

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 1.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        screen.icon?.let {
            Icon(it, contentDescription = null, tint = iconColor, modifier = Modifier.size(20.dp))
        }
        Text(
            text = screen.label,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
            color = contentColor,
            modifier = Modifier
                .weight(1f)
                .padding(start = 14.dp),
        )
        if (badge > 0) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(MaterialTheme.colorScheme.error)
                    .padding(horizontal = 8.dp, vertical = 2.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = if (badge > 99) "99+" else "$badge",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onError,
                )
            }
        }
    }
}

