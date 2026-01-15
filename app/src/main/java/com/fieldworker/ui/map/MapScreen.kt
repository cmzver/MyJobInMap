package com.fieldworker.ui.map

import android.Manifest
import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
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
import com.fieldworker.R
import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskPhoto
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.components.PhotoGallery
import com.fieldworker.ui.components.PhotoUploadConfirmDialog
import com.fieldworker.ui.list.TaskDetailBottomSheet
import com.fieldworker.ui.list.extractApartment
import com.fieldworker.ui.list.extractAdditionalInfo
import com.fieldworker.ui.list.extractPhoneNumber
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker

/**
 * Главный экран с картой и маркерами задач.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(
    viewModel: MapViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current
    val view = LocalView.current
    
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
    
    // Состояние разрешения на геолокацию
    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        )
    }
    
    // Запрос разрешения на геолокацию
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasLocationPermission = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (hasLocationPermission) {
            requestLocation(context, viewModel)
        }
    }
    
    // Запрашиваем местоположение при старте, если есть разрешение
    LaunchedEffect(hasLocationPermission) {
        if (hasLocationPermission) {
            requestLocation(context, viewModel)
        }
    }
    
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
    
    Box(modifier = Modifier.fillMaxSize()) {
        // Карта с маркерами
        OsmMapView(
            tasks = uiState.filteredTasks,
            onMarkerClick = { task -> viewModel.selectTask(task) },
            modifier = Modifier.fillMaxSize(),
            showMyLocation = uiState.showMyLocation,
            myLocationLat = uiState.myLocationLat,
            myLocationLon = uiState.myLocationLon
        )
        
        // Верхняя панель
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Индикатор offline-режима
            AnimatedVisibility(visible = uiState.isOffline) {
                OfflineBanner(
                    pendingActionsCount = uiState.pendingActionsCount,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }
            
            // Статистика задач
            TasksStatsBar(tasks = uiState.filteredTasks)
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
    if (uiState.selectedTask != null) {
        TaskDetailBottomSheet(
            task = uiState.selectedTask!!,
            comments = uiState.comments,
            isLoadingComments = uiState.isLoadingComments,
            photos = uiState.photos,
            isLoadingPhotos = uiState.isLoadingPhotos,
            isUploadingPhoto = uiState.isUploadingPhoto,
            baseUrl = baseUrl,
            authToken = authToken,
            onDismiss = { viewModel.selectTask(null) },
            onStatusChange = { viewModel.showStatusDialog() },
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
 * Баннер offline-режима
 */
@Composable
fun OfflineBanner(
    pendingActionsCount: Int,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
        shadowElevation = 6.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Warning,
                    contentDescription = null,
                    tint = Color(0xFFFF9500),
                    modifier = Modifier.size(16.dp)
                )
            }
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(id = R.string.offline_mode),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                if (pendingActionsCount > 0) {
                    Text(
                        text = stringResource(id = R.string.offline_unsynced, pendingActionsCount),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
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
@Composable
fun StatusChangeDialog(
    currentStatus: TaskStatus,
    onDismiss: () -> Unit,
    onStatusSelected: (TaskStatus, String) -> Unit
) {
    var comment by remember { mutableStateOf("") }
    var selectedStatus by remember { mutableStateOf(currentStatus) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Изменить статус") },
        text = {
            Column {
                TaskStatus.entries.filter { it != TaskStatus.UNKNOWN }.forEach { status ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = selectedStatus == status,
                            onClick = { selectedStatus = status }
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .clip(CircleShape)
                                .background(status.toColor())
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(status.displayName)
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                OutlinedTextField(
                    value = comment,
                    onValueChange = { comment = it },
                    label = { Text("Комментарий (необязательно)") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onStatusSelected(selectedStatus, comment) },
                enabled = selectedStatus != currentStatus || comment.isNotBlank()
            ) {
                Text("Сохранить")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
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
fun OsmMapView(
    tasks: List<Task>,
    onMarkerClick: (Task) -> Unit,
    modifier: Modifier = Modifier,
    showMyLocation: Boolean = true,
    myLocationLat: Double? = null,
    myLocationLon: Double? = null
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    
    val mapView = remember {
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            controller.setZoom(12.0)
            controller.setCenter(GeoPoint(55.7558, 37.6173))
        }
    }
    
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onDetach()
        }
    }
    
    LaunchedEffect(tasks, showMyLocation, myLocationLat, myLocationLon) {
        mapView.overlays.clear()
        
        // Добавляем маркер моего местоположения
        if (showMyLocation && myLocationLat != null && myLocationLon != null) {
            val myLocationMarker = Marker(mapView).apply {
                position = GeoPoint(myLocationLat, myLocationLon)
                title = "Моё местоположение"
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                icon = getMyLocationIcon(context)
            }
            mapView.overlays.add(myLocationMarker)
        }
        
        // Добавляем маркеры задач
        tasks.filter { it.hasValidCoordinates() }.forEach { task ->
            val marker = Marker(mapView).apply {
                position = GeoPoint(task.lat!!, task.lon!!)
                title = "[${task.taskNumber}] ${task.title}"
                snippet = task.address
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                icon = getMarkerIcon(context, task.status)
                
                setOnMarkerClickListener { _, _ ->
                    onMarkerClick(task)
                    true
                }
            }
            mapView.overlays.add(marker)
        }
        
        // Центрируем карту
        if (showMyLocation && myLocationLat != null && myLocationLon != null) {
            mapView.controller.setCenter(GeoPoint(myLocationLat, myLocationLon))
        } else {
            tasks.firstOrNull { it.hasValidCoordinates() }?.let { task ->
                mapView.controller.setCenter(GeoPoint(task.lat!!, task.lon!!))
            }
        }
        
        mapView.invalidate()
    }
    
    AndroidView(
        factory = { mapView },
        modifier = modifier
    )
}

private fun getMarkerIcon(context: android.content.Context, status: TaskStatus): Drawable? {
    val drawable = ContextCompat.getDrawable(context, R.drawable.ic_marker)?.mutate()
    drawable?.let {
        DrawableCompat.setTint(it, status.toColor().toArgb())
    }
    return drawable
}

private fun getMyLocationIcon(context: android.content.Context): Drawable? {
    val drawable = ContextCompat.getDrawable(context, R.drawable.ic_my_location)?.mutate()
    drawable?.let {
        DrawableCompat.setTint(it, Color(0xFF0A84FF).toArgb())
    }
    return drawable
}
