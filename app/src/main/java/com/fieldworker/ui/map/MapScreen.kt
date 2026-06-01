package com.fieldworker.ui.map

import android.Manifest
import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Point
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.text.TextPaint
import android.view.HapticFeedbackConstants
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.DrawableCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.fieldworker.R
import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskPhoto
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.components.CompactTaskCard
import com.fieldworker.ui.components.PhotoGallery
import com.fieldworker.ui.components.PhotoUploadConfirmDialog
import com.fieldworker.ui.list.TaskDetailBottomSheet
import com.fieldworker.ui.utils.extractApartment
import com.fieldworker.ui.utils.extractAdditionalInfo
import com.fieldworker.ui.utils.extractPhoneNumber
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Overlay
import org.osmdroid.views.overlay.Marker
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.roundToInt
import android.util.LruCache
import android.graphics.Color as AndroidColor

// Кэш bitmap'ов кластерных маркеров по ключу "STATUS_count"
// Bitmap иммутабелен после создания, поэтому несколько BitmapDrawable могут его разделять
private val clusterBitmapCache = LruCache<String, Bitmap>(64)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddressTaskGroupBottomSheet(
    group: TaskMarkerGroup,
    onDismiss: () -> Unit,
    onTaskSelected: (Task) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val sortedTasks = remember(group) { group.sortedTasks }
    val title = group.address.ifBlank {
        "\u0417\u0430\u044f\u0432\u043a\u0438 \u043f\u043e \u043e\u0434\u043d\u043e\u0439 \u0442\u043e\u0447\u043a\u0435"
    }
    val subtitle = when (group.count) {
        2, 3, 4 -> "${group.count} \u0437\u0430\u044f\u0432\u043a\u0438 \u043f\u043e \u044d\u0442\u043e\u043c\u0443 \u0430\u0434\u0440\u0435\u0441\u0443"
        else -> "${group.count} \u0437\u0430\u044f\u0432\u043e\u043a \u043f\u043e \u044d\u0442\u043e\u043c\u0443 \u0430\u0434\u0440\u0435\u0441\u0443"
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.background,
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            items(sortedTasks, key = Task::id, contentType = { "task_card" }) { task ->
                CompactTaskCard(
                    task = task,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onTaskSelected(task) }
                )
            }

            item {
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }
}

/**
 * Главный экран с картой и маркерами задач.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(
    viewModel: MapViewModel = hiltViewModel(),
    onOpenObjectCard: () -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val filteredTasks by viewModel.filteredTasks.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current
    val view = LocalView.current

    val baseUrl = viewModel.preferences.getFullServerUrl()
    val authToken = viewModel.preferences.getAuthToken()

    var selectedPhotoUri by remember { mutableStateOf<Uri?>(null) }
    var selectedGroup by remember { mutableStateOf<TaskMarkerGroup?>(null) }
    // Счётчик явных запросов "перейти к моему местоположению"
    var centerOnLocationTick by remember { mutableStateOf(0) }
    val savedMapPosition = remember { viewModel.getSavedMapPosition() }

    LaunchedEffect(uiState.isUploadingPhoto) {
        if (!uiState.isUploadingPhoto && selectedPhotoUri != null && uiState.error == null) {
            selectedPhotoUri = null
        }
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
        onResult = { uri: Uri? ->
            uri?.let {
                selectedPhotoUri = it
            }
        }
    )

    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasLocationPermission = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (hasLocationPermission) {
            requestLocation(context, viewModel)
        }
    }

    LaunchedEffect(hasLocationPermission) {
        if (hasLocationPermission) {
            requestLocation(context, viewModel)
        }
    }

    LaunchedEffect(uiState.error) {
        uiState.error?.let { error ->
            snackbarHostState.showSnackbar(error)
            viewModel.clearError()
        }
    }

    LaunchedEffect(uiState.statusUpdateSuccess) {
        if (uiState.statusUpdateSuccess) {
            snackbarHostState.showSnackbar("Статус обновлён")
            viewModel.clearStatusUpdateSuccess()
        }
    }

    Box(modifier = Modifier
        .fillMaxSize()
        .clipToBounds()
    ) {
        // Карта с маркерами
        OsmMapView(
            tasks = filteredTasks,
            onMarkerClick = { group ->
                if (group.isCluster) {
                    selectedGroup = group
                } else {
                    selectedGroup = null
                    viewModel.selectTask(group.primaryTask)
                }
            },
            modifier = Modifier.fillMaxSize(),
            showMyLocation = uiState.showMyLocation,
            myLocationLat = uiState.myLocationLat,
            myLocationLon = uiState.myLocationLon,
            centerOnLocationTick = centerOnLocationTick,
            savedPosition = savedMapPosition,
            onSavePosition = { lat, lon, zoom -> viewModel.saveMapPosition(lat, lon, zoom) },
        )
        
        // Верхняя панель
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Статистика задач
            TasksStatsBar(tasks = filteredTasks)
        }
        
        // Индикатор загрузки
        if (uiState.isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center)
            )
        }
        
        // Кнопки справа
                Column(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            MapActionButton(
                onClick = {
                    view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    if (hasLocationPermission) {
                        centerOnLocationTick++
                        requestLocation(context, viewModel)
                    } else {
                        locationPermissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    }
                },
                icon = Icons.Default.LocationOn,
                contentDescription = stringResource(id = R.string.map_my_location),
                isActive = uiState.myLocationLat != null
            )

            MapActionButton(
                onClick = {
                    view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    viewModel.forceSync()
                },
                icon = Icons.Default.Refresh,
                contentDescription = stringResource(id = R.string.map_refresh)
            )
        }

        
        // Snackbar
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter)
        )
        
        // Диалог изменения статуса
        if (uiState.showStatusDialog && uiState.selectedTask != null) {
            StatusChangeDialog(
                currentStatus = uiState.selectedTask!!.status,
                onDismiss = { viewModel.hideStatusDialog() },
                onStatusSelected = { status, comment ->
                    viewModel.updateTaskStatus(
                        uiState.selectedTask!!.id,
                        status,
                        comment
                    )
                }
            )
        }
    }
    
    // ModalBottomSheet для деталей задачи (вне Box)
    selectedGroup?.let { group ->
        AddressTaskGroupBottomSheet(
            group = group,
            onDismiss = { selectedGroup = null },
            onTaskSelected = { task ->
                selectedGroup = null
                viewModel.selectTask(task)
            }
        )
    }

    if (uiState.selectedTask != null) {
        TaskDetailBottomSheet(
            task = uiState.selectedTask!!,
            addressDetails = uiState.addressDetails,
            isLoadingAddress = uiState.isLoadingAddress,
            hasAttemptedAddressLookup = uiState.hasAttemptedAddressLookup,
            comments = uiState.comments,
            isLoadingComments = uiState.isLoadingComments,
            photos = uiState.photos,
            isLoadingPhotos = uiState.isLoadingPhotos,
            isUploadingPhoto = uiState.isUploadingPhoto,
            baseUrl = baseUrl,
            authToken = authToken,
            onDismiss = { viewModel.selectTask(null) },
            onStatusChange = { viewModel.showStatusDialog() },
            onOpenObjectCard = onOpenObjectCard,
            onAddComment = { text -> viewModel.addComment(uiState.selectedTask!!.id, text) },
            onAddPhotoClick = {
                photoPickerLauncher.launch(
                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                )
            },
            onDeletePhoto = { photoId -> viewModel.deletePhoto(photoId) },
            onPlannedDateChange = { date -> viewModel.updatePlannedDate(uiState.selectedTask!!.id, date) }
        )
        
        // Диалог подтверждения загрузки фото
        selectedPhotoUri?.let { uri ->
            PhotoUploadConfirmDialog(
                photoUri = uri,
                isUploading = uiState.isUploadingPhoto,
                onUpload = { photoType ->
                    viewModel.uploadPhoto(uiState.selectedTask!!.id, uri, photoType)
                },
                onDismiss = { selectedPhotoUri = null }
            )
        }
    }
}

/**
 * Запрос текущего местоположения
 */
@SuppressLint("MissingPermission")
private fun requestLocation(context: android.content.Context, viewModel: MapViewModel) {
    val locationManager = context.getSystemService(android.content.Context.LOCATION_SERVICE) as LocationManager
    
    // Пробуем получить последнее известное местоположение
    val lastKnownLocation = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
        ?: locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
    
    lastKnownLocation?.let {
        viewModel.updateMyLocation(it.latitude, it.longitude)
    }
    
    // Запрашиваем обновление местоположения
    val locationListener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            viewModel.updateMyLocation(location.latitude, location.longitude)
            locationManager.removeUpdates(this)
        }
        
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }
    
    try {
        if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                1000L,
                10f,
                locationListener
            )
        } else if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            locationManager.requestLocationUpdates(
                LocationManager.NETWORK_PROVIDER,
                1000L,
                10f,
                locationListener
            )
        }
    } catch (e: Exception) {
        e.printStackTrace()
    }
}

/**
 * Панель статистики задач
 */
@Composable
fun TasksStatsBar(
    tasks: List<Task>,
    modifier: Modifier = Modifier
) {
    val newCount = tasks.count { it.status == TaskStatus.NEW }
    val inProgressCount = tasks.count { it.status == TaskStatus.IN_PROGRESS }
    val doneCount = tasks.count { it.status == TaskStatus.DONE }

    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
        shadowElevation = 6.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            StatItem(count = newCount, label = stringResource(id = R.string.stat_new), color = Color(0xFFFF3B30))
            StatItem(count = inProgressCount, label = stringResource(id = R.string.stat_in_progress), color = Color(0xFFFF9500))
            StatItem(count = doneCount, label = stringResource(id = R.string.stat_done), color = Color(0xFF34C759))
        }
    }
}


@Composable
fun StatItem(count: Int, label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(color)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = "$count",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}



/**
 * Карточка комментария
 */
@Composable
private fun MapActionButton(
    onClick: () -> Unit,
    icon: ImageVector,
    contentDescription: String,
    isActive: Boolean = false
) {
    Surface(
        modifier = Modifier.size(48.dp),
        shape = CircleShape,
        color = if (isActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        contentColor = if (isActive) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary,
        tonalElevation = 0.dp,
        shadowElevation = 6.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        IconButton(onClick = onClick) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                modifier = Modifier.size(22.dp)
            )
        }
    }
}

@Composable
fun CommentCard(comment: Comment) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (comment.isStatusChange) 
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
            else 
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            Icon(
                imageVector = if (comment.isStatusChange) Icons.Default.Edit else Icons.Default.MailOutline,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = if (comment.isStatusChange) 
                    MaterialTheme.colorScheme.primary 
                else 
                    MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.width(8.dp))
            Column {
                Text(
                    text = comment.text,
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${comment.author} • ${comment.createdAt.take(16).replace("T", " ")}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun PriorityBadge(priority: Priority) {
    val (color, icon) = when (priority) {
        Priority.EMERGENCY -> Color(0xFFFF3B30) to Icons.Default.Warning                // Аварийная - красный
        Priority.URGENT -> Color(0xFFFF9500) to Icons.Default.Warning           // Срочная - оранжевый
        Priority.CURRENT -> Color(0xFF0A84FF) to Icons.Default.DateRange        // Текущая - синий
        Priority.PLANNED -> Color(0xFF34C759) to Icons.Default.DateRange        // Плановая - зелёный
    }
    
    Icon(
        imageVector = icon,
        contentDescription = priority.displayName,
        tint = color,
        modifier = Modifier.size(20.dp)
    )
}

/**
 * Диалог изменения статуса с комментарием
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatusChangeDialog(
    currentStatus: TaskStatus,
    onDismiss: () -> Unit,
    onStatusSelected: (TaskStatus, String) -> Unit
) {
    var comment by remember { mutableStateOf("") }
    val availableStatuses = when (currentStatus) {
        TaskStatus.NEW -> listOf(TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED)
        TaskStatus.IN_PROGRESS -> listOf(TaskStatus.DONE, TaskStatus.CANCELLED)
        else -> emptyList()
    }
    var selectedStatus by remember(currentStatus) { mutableStateOf(availableStatuses.firstOrNull() ?: currentStatus) }
    val requiresComment = selectedStatus == TaskStatus.DONE || selectedStatus == TaskStatus.CANCELLED
    val dialogTitle = when (selectedStatus) {
        TaskStatus.DONE -> "Завершение заявки"
        TaskStatus.CANCELLED -> "Отмена заявки"
        else -> "Изменить статус"
    }
    val commentLabel = when (selectedStatus) {
        TaskStatus.DONE -> "Что выполнено"
        TaskStatus.CANCELLED -> "Причина отмены"
        else -> if (requiresComment) "Комментарий" else "Комментарий (необязательно)"
    }
    val commentPlaceholder = when (selectedStatus) {
        TaskStatus.DONE -> "Описание работ"
        TaskStatus.CANCELLED -> "Причина"
        else -> "Введите комментарий"
    }
    val confirmText = when (selectedStatus) {
        TaskStatus.DONE -> "Завершить"
        TaskStatus.CANCELLED -> "Отменить"
        else -> "Сохранить"
    }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { 
            Text(
                text = dialogTitle,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            ) 
        },
        text = {
            Column {
                if (availableStatuses.isEmpty()) {
                    Text(
                        text = "Для текущего статуса доступных переходов нет.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium
                    )
                } else {
                    availableStatuses.forEach { status ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selectedStatus = status }
                                .padding(vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides androidx.compose.ui.unit.Dp.Unspecified) {
                                RadioButton(
                                    selected = selectedStatus == status,
                                    onClick = { selectedStatus = status }
                                )
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .clip(CircleShape)
                                    .background(status.toColor())
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = status.displayName,
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = comment,
                        onValueChange = { comment = it },
                        label = { Text(commentLabel) },
                        placeholder = { Text(commentPlaceholder) },
                        modifier = Modifier.fillMaxWidth(),
                        maxLines = 2,
                        textStyle = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onStatusSelected(selectedStatus, comment) },
                enabled = availableStatuses.isNotEmpty() &&
                    selectedStatus != currentStatus &&
                    (!requiresComment || comment.isNotBlank()),
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 8.dp)
            ) {
                Text(confirmText)
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Text("Отмена")
            }
        }
    )
}

fun TaskStatus.toColor(): Color = when (this) {
    TaskStatus.NEW -> Color(0xFFFF3B30)
    TaskStatus.IN_PROGRESS -> Color(0xFFFF9500)
    TaskStatus.DONE -> Color(0xFF34C759)
    TaskStatus.CANCELLED -> Color(0xFF8E8E93)
    TaskStatus.UNKNOWN -> Color(0xFF8E8E93)
}

// Маркеры на карте красятся по приоритету (как на портале) — аварии выделяются.
fun Priority.toColor(): Color = when (this) {
    Priority.EMERGENCY -> Color(0xFFFF3B30) // Аварийная — красный
    Priority.URGENT -> Color(0xFFFF9500)    // Срочная — оранжевый
    Priority.CURRENT -> Color(0xFF0A84FF)   // Текущая — синий
    Priority.PLANNED -> Color(0xFF34C759)   // Плановая — зелёный
}

fun TaskStatus.toIcon() = when (this) {
    TaskStatus.NEW -> Icons.Default.Star
    TaskStatus.IN_PROGRESS -> Icons.Default.Refresh
    TaskStatus.DONE -> Icons.Default.CheckCircle
    TaskStatus.CANCELLED -> Icons.Default.Close
    TaskStatus.UNKNOWN -> Icons.Default.Warning
}

/**
 * Composable обертка для osmdroid MapView через AndroidView.
 */
@Composable
private fun OsmMapView(
    tasks: List<Task>,
    onMarkerClick: (TaskMarkerGroup) -> Unit,
    modifier: Modifier = Modifier,
    showMyLocation: Boolean = true,
    myLocationLat: Double? = null,
    myLocationLon: Double? = null,
    centerOnLocationTick: Int = 0,
    savedPosition: Triple<Double, Double, Double>? = null,
    onSavePosition: (lat: Double, lon: Double, zoom: Double) -> Unit = { _, _, _ -> },
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val coroutineScope = rememberCoroutineScope()
    val markerGroups = remember(tasks) { buildTaskMarkerGroups(tasks) }
    var pendingGroupOpenJob by remember { mutableStateOf<Job?>(null) }

    val mapView = remember {
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            if (savedPosition != null) {
                controller.setZoom(savedPosition.third)
                controller.setCenter(GeoPoint(savedPosition.first, savedPosition.second))
            } else {
                controller.setZoom(12.0)
                controller.setCenter(GeoPoint(55.7558, 37.6173))
            }
        }
    }

    // Если есть сохранённая позиция — карта уже спозиционирована при создании mapView
    var mapCentered by remember { mutableStateOf(savedPosition != null) }

    // Явный запрос "перейти к моему местоположению" — сбрасываем флаг
    LaunchedEffect(centerOnLocationTick) {
        if (centerOnLocationTick > 0) mapCentered = false
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> {
                    mapView.onPause()
                    val center = mapView.mapCenter
                    onSavePosition(center.latitude, center.longitude, mapView.zoomLevelDouble)
                }
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)

        onDispose {
            pendingGroupOpenJob?.cancel()
            lifecycleOwner.lifecycle.removeObserver(observer)
            val center = mapView.mapCenter
            onSavePosition(center.latitude, center.longitude, mapView.zoomLevelDouble)
            mapView.onDetach()
        }
    }

    LaunchedEffect(markerGroups, showMyLocation, myLocationLat, myLocationLon) {
        mapView.overlays.clear()

        if (showMyLocation && myLocationLat != null && myLocationLon != null) {
            val myLocationMarker = Marker(mapView).apply {
                position = GeoPoint(myLocationLat, myLocationLon)
                title = "Моё местоположение"
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                icon = getMyLocationIcon(context)
            }
            mapView.overlays.add(myLocationMarker)
        }

        markerGroups.forEach { group ->
            if (group.isCluster) {
                val clusterDrawable = getClusterMarkerIcon(
                    context = context,
                    markerColor = group.summary.highestPriority.toColor(),
                    count = group.count
                ) ?: return@forEach

                mapView.overlays.add(
                    ClusterBubbleOverlay(
                        mapView = mapView,
                        point = GeoPoint(group.lat, group.lon),
                        drawable = clusterDrawable,
                        onTap = {
                            pendingGroupOpenJob?.cancel()
                            val targetZoom = maxOf(mapView.zoomLevelDouble, 17.0)
                            mapView.controller.animateTo(GeoPoint(group.lat, group.lon), targetZoom, 400L)
                            pendingGroupOpenJob = coroutineScope.launch {
                                delay(420)
                                onMarkerClick(group)
                            }
                        }
                    )
                )
            } else {
                val marker = Marker(mapView).apply {
                    position = GeoPoint(group.lat, group.lon)
                    title = "[${group.primaryTask.taskNumber}] ${group.primaryTask.title}"
                    snippet = group.address
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                    icon = getMarkerIcon(context, group.summary.highestPriority.toColor(), group.count)

                    setOnMarkerClickListener { _, _ ->
                        pendingGroupOpenJob?.cancel()
                        val targetZoom = maxOf(mapView.zoomLevelDouble, 17.0)
                        mapView.controller.animateTo(GeoPoint(group.lat, group.lon), targetZoom, 400L)
                        pendingGroupOpenJob = coroutineScope.launch {
                            delay(220)
                            onMarkerClick(group)
                        }
                        true
                    }
                }
                mapView.overlays.add(marker)
            }
        }

        // Центрируем карту только при первой загрузке данных.
        // При последующих обновлениях маркеров (смена статуса, фильтры) позицию не трогаем.
        if (!mapCentered) {
            val centered = when {
                markerGroups.isNotEmpty() -> {
                    fitMapToMarkers(mapView, markerGroups)
                    true
                }
                showMyLocation && myLocationLat != null && myLocationLon != null -> {
                    mapView.controller.animateTo(GeoPoint(myLocationLat, myLocationLon))
                    true
                }
                else -> false
            }
            if (centered) mapCentered = true
        }

        mapView.invalidate()
    }

    AndroidView(
        factory = { mapView },
        modifier = modifier
    )
}

private fun fitMapToMarkers(mapView: MapView, groups: List<TaskMarkerGroup>) {
    if (groups.isEmpty()) return
    if (groups.size == 1) {
        mapView.controller.setCenter(GeoPoint(groups[0].lat, groups[0].lon))
        mapView.controller.setZoom(16.0)
        return
    }
    val lats = groups.map { it.lat }
    val lons = groups.map { it.lon }
    val box = BoundingBox(lats.max(), lons.max(), lats.min(), lons.min())
    // zoomToBoundingBox до отрисовки View может не знать размеры — откладываем через post
    mapView.post {
        mapView.zoomToBoundingBox(box, false, 120)
    }
}

private fun getMarkerIcon(
    context: android.content.Context,
    color: Color,
    count: Int = 1,
): Drawable? {
    if (count > 1) {
        return getClusterMarkerIcon(context, color, count)
    }

    val drawable = ContextCompat.getDrawable(context, R.drawable.ic_marker)?.mutate()
    drawable?.let {
        DrawableCompat.setTint(it, color.toArgb())
    }
    return drawable
}

private fun getClusterMarkerIcon(
    context: android.content.Context,
    markerColor: Color,
    count: Int,
): Drawable? {
    val displayCount = if (count > 99) 99 else count
    val cacheKey = "${markerColor.toArgb()}_$displayCount"
    val cached = clusterBitmapCache.get(cacheKey)
    // Создаём новый BitmapDrawable-обёртку каждый раз: у каждого overlay свои bounds,
    // которые мутируются в ClusterBubbleOverlay.draw(), а Bitmap при этом один.
    if (cached != null) return BitmapDrawable(context.resources, cached)

    val density = context.resources.displayMetrics.density
    val bubbleSize = (32 * density).roundToInt()
    val bitmap = Bitmap.createBitmap(bubbleSize, bubbleSize, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val centerX = bubbleSize / 2f
    val centerY = bubbleSize / 2f
    val bubbleRadius = bubbleSize / 2f
    val strokeWidth = max(2, density.roundToInt()).toFloat()
    val clusterColor = markerColor.toArgb()

    val bubblePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = clusterColor
        style = Paint.Style.FILL
    }
    val bubbleStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = AndroidColor.WHITE
        style = Paint.Style.STROKE
        this.strokeWidth = strokeWidth
    }
    val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = AndroidColor.WHITE
        textAlign = Paint.Align.CENTER
        textSize = if (count >= 100) 9f * density else 11f * density
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    canvas.drawCircle(centerX, centerY, bubbleRadius, bubblePaint)
    canvas.drawCircle(centerX, centerY, bubbleRadius - strokeWidth / 2f, bubbleStrokePaint)

    val markerText = if (count > 99) "99+" else count.toString()
    val textY = centerY - (textPaint.descent() + textPaint.ascent()) / 2f
    canvas.drawText(markerText, centerX, textY, textPaint)

    clusterBitmapCache.put(cacheKey, bitmap)
    return BitmapDrawable(context.resources, bitmap)
}

private class ClusterBubbleOverlay(
    private val mapView: MapView,
    private val point: GeoPoint,
    private val drawable: Drawable,
    private val onTap: () -> Unit,
) : Overlay() {
    private val bounds = Rect()

    override fun draw(canvas: Canvas, mapView: MapView, shadow: Boolean) {
        if (shadow) return

        val screenPoint = mapView.projection.toPixels(point, Point())
        val halfWidth = drawable.intrinsicWidth / 2
        val halfHeight = drawable.intrinsicHeight / 2
        bounds.set(
            screenPoint.x - halfWidth,
            screenPoint.y - halfHeight,
            screenPoint.x + halfWidth,
            screenPoint.y + halfHeight,
        )
        drawable.bounds = bounds
        drawable.draw(canvas)
    }

    override fun onSingleTapConfirmed(e: android.view.MotionEvent, mapView: MapView): Boolean {
        return if (bounds.contains(e.x.roundToInt(), e.y.roundToInt())) {
            onTap()
            true
        } else {
            false
        }
    }
}

private fun getMyLocationIcon(context: android.content.Context): Drawable? {
    val drawable = ContextCompat.getDrawable(context, R.drawable.ic_my_location)?.mutate()
    drawable?.let {
        DrawableCompat.setTint(it, Color(0xFF0A84FF).toArgb())
    }
    return drawable
}
