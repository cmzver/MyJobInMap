package com.fieldworker.ui.main

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.ui.list.TaskListScreen
import com.fieldworker.ui.map.MapScreen
import com.fieldworker.ui.map.MapViewModel
import com.fieldworker.ui.settings.ConnectionStatus
import com.fieldworker.ui.settings.DeveloperScreen
import com.fieldworker.ui.settings.SettingsScreen
import com.fieldworker.ui.components.PhotoUploadConfirmDialog

/**
 * Главный экран приложения с навигацией между картой, списком и настройками
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    onLogout: () -> Unit = {},
    viewModel: MapViewModel = hiltViewModel()
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var showDeveloperScreen by remember { mutableStateOf(false) }
    var showLogoutDialog by remember { mutableStateOf(false) }
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val connectionStatus by viewModel.connectionStatus.collectAsStateWithLifecycle()
    
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
    
    // Показываем ошибки в Snackbar
    LaunchedEffect(uiState.error) {
        uiState.error?.let { error ->
            snackbarHostState.showSnackbar(error)
            viewModel.clearError()
        }
    }
    
    // Показываем успешное обновление
    LaunchedEffect(uiState.statusUpdateSuccess) {
        if (uiState.statusUpdateSuccess) {
            snackbarHostState.showSnackbar("Статус обновлён")
            viewModel.clearStatusUpdateSuccess()
        }
    }
    
    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 0.dp
            ) {
                NavigationBarItem(
                    icon = { 
                        Icon(
                            Icons.Default.Place, 
                            contentDescription = null,
                            modifier = Modifier.size(24.dp)
                        ) 
                    },
                    label = { 
                        Text(
                            "Карта",
                            style = MaterialTheme.typography.labelSmall
                        ) 
                    },
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.primary,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                )
                NavigationBarItem(
                    icon = { 
                        BadgedBox(
                            badge = {
                                val newCount = uiState.tasks.count { it.status.name == "NEW" }
                                if (newCount > 0) {
                                    Badge(
                                        containerColor = MaterialTheme.colorScheme.error
                                    ) { 
                                        Text("$newCount") 
                                    }
                                }
                            }
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.List, 
                                contentDescription = null,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    },
                    label = { 
                        Text(
                            "Список",
                            style = MaterialTheme.typography.labelSmall
                        ) 
                    },
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.primary,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                )
                NavigationBarItem(
                    icon = { 
                        Icon(
                            Icons.Default.Settings, 
                            contentDescription = null,
                            modifier = Modifier.size(24.dp)
                        ) 
                    },
                    label = { 
                        Text(
                            "Настройки",
                            style = MaterialTheme.typography.labelSmall
                        ) 
                    },
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
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
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (selectedTab) {
                0 -> MapScreen(viewModel = viewModel)
                1 -> TaskListScreen(
                    tasks = uiState.filteredTasks,
                    comments = uiState.comments,
                    isLoading = uiState.isLoading,
                    isLoadingComments = uiState.isLoadingComments,
                    selectedTask = uiState.selectedTask,
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
                    priorityFilter = uiState.priorityFilter,
                    searchQuery = uiState.searchQuery,
                    onStatusFilterChange = { viewModel.setStatusFilter(it) },
                    onPriorityFilterChange = { viewModel.setPriorityFilter(it) },
                    onSearchQueryChange = { viewModel.setSearchQuery(it) },
                    sortOrder = uiState.sortOrder,
                    onSortOrderChange = { viewModel.setSortOrder(it) },
                    userLat = uiState.myLocationLat,
                    userLon = uiState.myLocationLon,
                    // Фотографии
                    photos = uiState.photos,
                    isLoadingPhotos = uiState.isLoadingPhotos,
                    isUploadingPhoto = uiState.isUploadingPhoto,
                    baseUrl = baseUrl,
                    authToken = authToken,
                    onAddPhotoClick = {
                        photoPickerLauncher.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
                    },
                    onDeletePhoto = { photoId -> viewModel.deletePhoto(photoId) },
                    // Планируемая дата
                    onPlannedDateChange = { taskId, date -> viewModel.updatePlannedDate(taskId, date) }
                )
                2 -> SettingsScreen(
                    preferences = viewModel.preferences,
                    authRepository = viewModel.authRepository,
                    onTestConnection = { url -> viewModel.testConnection(url) },
                    connectionStatus = connectionStatus,
                    onOpenDeveloperScreen = { showDeveloperScreen = true },
                    onLogout = { showLogoutDialog = true }
                )
            }
            
            // Экран разработчика поверх всего
            if (showDeveloperScreen) {
                DeveloperScreen(
                    preferences = viewModel.preferences,
                    onBack = { showDeveloperScreen = false }
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
