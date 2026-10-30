package com.fieldworker.ui.components

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.fieldworker.R
import com.fieldworker.domain.model.PendingPhoto
import com.fieldworker.domain.model.PhotoType
import com.fieldworker.domain.model.TaskPhoto
import com.fieldworker.domain.model.photoTypeDisplayName
import com.fieldworker.ui.theme.AppShape
import com.fieldworker.ui.utils.accentTextColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Headers
import java.io.File
import java.io.InputStream
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Галерея фотографий заявки: плитки «Снять» и «Галерея», затем снимки,
 * ждущие отправки, затем фото с сервера. Заголовок — у секции-владельца.
 */
@Composable
fun PhotoGallery(
    photos: List<TaskPhoto>,
    isLoading: Boolean,
    isUploading: Boolean,
    baseUrl: String,
    authToken: String? = null,
    onAddPhotoClick: () -> Unit,
    onDeletePhoto: (Long) -> Unit,
    modifier: Modifier = Modifier,
    pendingPhotos: List<PendingPhoto> = emptyList(),
    onTakePhotoClick: (() -> Unit)? = null,
    onCancelPendingPhoto: (Long) -> Unit = {},
    emptyText: String? = "Нет фотографий — снимите или выберите из галереи."
) {
    var selectedPhoto by remember { mutableStateOf<TaskPhoto?>(null) }
    var selectedPending by remember { mutableStateOf<PendingPhoto?>(null) }

    Column(modifier = modifier.fillMaxWidth()) {
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 4.dp)
        ) {
            if (onTakePhotoClick != null) {
                item(key = "take") {
                    AddPhotoTile(
                        label = "Снять",
                        iconPainter = painterResource(id = R.drawable.ic_camera),
                        isBusy = isUploading,
                        onClick = onTakePhotoClick
                    )
                }
            }
            item(key = "pick") {
                AddPhotoTile(
                    label = "Галерея",
                    iconVector = Icons.Default.Add,
                    // Крутилка одна — на первой плитке
                    isBusy = isUploading && onTakePhotoClick == null,
                    enabled = !isUploading,
                    onClick = onAddPhotoClick
                )
            }

            items(pendingPhotos, key = { "pending-${it.id}" }) { pending ->
                PendingPhotoThumbnail(
                    photo = pending,
                    onClick = { selectedPending = pending }
                )
            }

            items(photos, key = { it.id }) { photo ->
                PhotoThumbnail(
                    photo = photo,
                    baseUrl = baseUrl,
                    authToken = authToken,
                    onClick = { selectedPhoto = photo }
                )
            }
        }

        if (emptyText != null && photos.isEmpty() && !isLoading) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = emptyText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }

    // Диалог просмотра фото
    selectedPhoto?.let { photo ->
        PhotoViewDialog(
            photo = photo,
            baseUrl = baseUrl,
            authToken = authToken,
            onDismiss = { selectedPhoto = null },
            onDelete = {
                onDeletePhoto(photo.id)
                selectedPhoto = null
            }
        )
    }

    selectedPending?.let { pending ->
        PendingPhotoDialog(
            photo = pending,
            onDismiss = { selectedPending = null },
            onCancelUpload = {
                onCancelPendingPhoto(pending.id)
                selectedPending = null
            }
        )
    }
}

/**
 * Диалог подтверждения загрузки фото с выбором типа
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PhotoUploadConfirmDialog(
    photoUri: Uri,
    isUploading: Boolean,
    onUpload: (String) -> Unit,
    onDismiss: () -> Unit,
    isOffline: Boolean = false,
    /** К какой заявке фото — после возврата из камеры карточка может быть уже закрыта. */
    taskLabel: String? = null
) {
    var selectedType by remember { mutableStateOf(PhotoType.COMPLETION) }
    
    Dialog(onDismissRequest = { if (!isUploading) onDismiss() }) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.large
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Новое фото",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                taskLabel?.let { label ->
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = label,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                // Превью фото
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                    shape = MaterialTheme.shapes.medium
                ) {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(photoUri)
                            .crossfade(true)
                            .build(),
                        contentDescription = "Выбранное фото",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                // Выбор типа фото
                Text(
                    text = "Тип фотографии:",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.align(Alignment.Start)
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                // Кнопки выбора типа: не влезли в строку — переносятся целиком
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    PhotoType.entries.forEach { type ->
                        FilterChip(
                            selected = selectedType == type,
                            onClick = { selectedType = type },
                            label = { Text(type.displayName, maxLines = 1) },
                            enabled = !isUploading
                        )
                    }
                }
                
                if (isOffline) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Нет связи — фото сохранится и отправится само, когда она появится.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.align(Alignment.Start)
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))
                
                // Прогресс сохранения или кнопки
                if (isUploading) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        LinearProgressIndicator(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp)),
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Сохранение…",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                } else {
                    // Кнопки действий
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = onDismiss,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Отмена")
                        }
                        
                        Button(
                            onClick = { onUpload(selectedType.value) },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(if (isOffline) "Сохранить" else "Отправить", maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Плитка добавления фото: иконка и подпись источника.
 */
@Composable
private fun AddPhotoTile(
    label: String,
    isBusy: Boolean,
    onClick: () -> Unit,
    iconPainter: Painter? = null,
    iconVector: ImageVector? = null,
    enabled: Boolean = !isBusy
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = AppShape.md,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.size(80.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            if (isBusy) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 2.dp
                )
            } else {
                val tint = if (enabled) accentTextColor() else MaterialTheme.colorScheme.onSurfaceVariant
                when {
                    iconPainter != null -> Icon(iconPainter, null, tint = tint, modifier = Modifier.size(26.dp))
                    iconVector != null -> Icon(iconVector, null, tint = tint, modifier = Modifier.size(26.dp))
                }
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * Миниатюра снимка из очереди: локальный файл и плашка состояния.
 */
@Composable
private fun PendingPhotoThumbnail(
    photo: PendingPhoto,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(80.dp)
            .clip(AppShape.md)
            .clickable(onClick = onClick)
    ) {
        AsyncImage(
            model = File(photo.filePath),
            contentDescription = if (photo.isFailed) "Фото не отправлено" else "Фото ждёт отправки",
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.surfaceVariant)
        )
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(
                    if (photo.isFailed) {
                        MaterialTheme.colorScheme.error.copy(alpha = 0.9f)
                    } else {
                        Color.Black.copy(alpha = 0.55f)
                    }
                )
                .padding(horizontal = 6.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                painter = painterResource(
                    id = if (photo.isFailed) R.drawable.ic_warning_triangle else R.drawable.ic_sync_status
                ),
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(12.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = if (photo.isFailed) "ошибка" else "ждёт",
                style = MaterialTheme.typography.labelSmall,
                color = Color.White,
                maxLines = 1
            )
        }
    }
}

/**
 * Снимок из очереди: что с ним происходит и как от него отказаться.
 */
@Composable
private fun PendingPhotoDialog(
    photo: PendingPhoto,
    onDismiss: () -> Unit,
    onCancelUpload: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (photo.isFailed) "Фото не отправлено" else "Фото в очереди") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AsyncImage(
                    model = File(photo.filePath),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                        .clip(AppShape.md)
                )
                Text(
                    text = if (photo.isFailed) {
                        "Сервер не принял фото. Повторить отправку можно из плашки «Не отправлено»."
                    } else {
                        "«${photoTypeDisplayName(photo.photoType)}» — отправится само, как только будет связь."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Закрыть") }
        },
        dismissButton = {
            TextButton(
                onClick = onCancelUpload,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
            ) {
                Text("Удалить")
            }
        }
    )
}

/**
 * Миниатюра фотографии (без кнопки удаления и подписи)
 */
@Composable
private fun PhotoThumbnail(
    photo: TaskPhoto,
    baseUrl: String,
    authToken: String?,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .size(80.dp)
            .clickable { onClick() },
        shape = AppShape.md
    ) {
        val requestBuilder = ImageRequest.Builder(LocalContext.current)
            .data(photo.getFullUrl(baseUrl))
            .crossfade(true)
        if (!authToken.isNullOrBlank()) {
            requestBuilder.headers(
                Headers.Builder()
                    .add("Authorization", "Bearer $authToken")
                    .build()
            )
        }
        AsyncImage(
            model = requestBuilder.build(),
            contentDescription = photo.originalName,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )
    }
}

/**
 * Диалог просмотра фото на весь экран с информацией и кнопками действий
 */
@Composable
private fun PhotoViewDialog(
    photo: TaskPhoto,
    baseUrl: String,
    authToken: String?,
    onDismiss: () -> Unit,
    onDelete: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    
    // Состояние для зума и панорамирования
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    
    // Форматирование даты
    val formattedDate = remember(photo.createdAt) {
        try {
            val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
            val outputFormat = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault())
            val date = inputFormat.parse(photo.createdAt.substringBefore("."))
            date?.let { outputFormat.format(it) } ?: photo.createdAt
        } catch (e: Exception) {
            photo.createdAt
        }
    }
    
    // Тип фото на русском
    val photoTypeDisplay = photo.getPhotoTypeDisplayName()
    
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.95f))
        ) {
            // Изображение с зумом
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(photo.getFullUrl(baseUrl))
                    .crossfade(true)
                    .apply {
                        if (!authToken.isNullOrBlank()) {
                            headers(
                                Headers.Builder()
                                    .add("Authorization", "Bearer $authToken")
                                    .build()
                            )
                        }
                    }
                    .build(),
                contentDescription = photo.originalName,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = 60.dp, bottom = 160.dp)
                    .graphicsLayer(
                        scaleX = scale,
                        scaleY = scale,
                        translationX = offsetX,
                        translationY = offsetY
                    )
                    .pointerInput(Unit) {
                        detectTransformGestures { _, pan, zoom, _ ->
                            scale = (scale * zoom).coerceIn(1f, 5f)
                            if (scale > 1f) {
                                offsetX += pan.x
                                offsetY += pan.y
                            } else {
                                offsetX = 0f
                                offsetY = 0f
                            }
                        }
                    }
            )
            
            // Верхняя панель с кнопкой закрытия
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Заголовок
                    Text(
                        text = "Просмотр фото",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(start = 8.dp)
                    )
                    
                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Закрыть",
                            tint = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
            
            // Нижняя панель с информацией и кнопками
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomCenter),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                ) {
                    // Информация о фото
                    Text(
                        text = "Информация",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    // Тип фото
                    Row(
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Info,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Тип: ",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = photoTypeDisplay,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(4.dp))
                    
                    // Дата
                    Row(
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.DateRange,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Дата: ",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = formattedDate,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    
                    // Имя файла (если есть)
                    photo.originalName?.let { name ->
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Файл: ",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = name,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Кнопки действий
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Кнопка сохранения
                        OutlinedButton(
                            onClick = {
                                scope.launch {
                                    isSaving = true
                                    val success = savePhotoToGallery(
                                        context = context,
                                        imageUrl = photo.getFullUrl(baseUrl),
                                        fileName = photo.originalName ?: photo.filename
                                    )
                                    isSaving = false
                                    if (success) {
                                        Toast.makeText(context, "Фото сохранено в галерею", Toast.LENGTH_SHORT).show()
                                    } else {
                                        Toast.makeText(context, "Ошибка сохранения", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            },
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp),
                            enabled = !isSaving,
                            shape = MaterialTheme.shapes.medium
                        ) {
                            if (isSaving) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Icon(
                                    painter = painterResource(id = R.drawable.ic_download),
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Сохранить",
                                style = MaterialTheme.typography.labelMedium
                            )
                        }
                        
                        // Кнопка удаления
                        Button(
                            onClick = { showDeleteConfirm = true },
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.error
                            ),
                            shape = MaterialTheme.shapes.medium
                        ) {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Удалить",
                                style = MaterialTheme.typography.labelMedium
                            )
                        }
                    }
                    
                    // Подсказка о зуме
                    if (scale == 1f) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "✨ Используйте жесты для увеличения",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                        )
                    }
                }
            }
        }
    }
    
    // Диалог подтверждения удаления
    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Удалить фото?") },
            text = { Text("Это действие нельзя отменить.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteConfirm = false
                        onDelete()
                    },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text("Удалить")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) {
                    Text("Отмена")
                }
            }
        )
    }
}

/**
 * Сохраняет фото из URL в галерею устройства
 */
private suspend fun savePhotoToGallery(
    context: Context,
    imageUrl: String,
    fileName: String
): Boolean = withContext(Dispatchers.IO) {
    try {
        val url = URL(imageUrl)
        val connection = url.openConnection()
        connection.connect()
        val inputStream: InputStream = connection.getInputStream()
        val bytes = inputStream.readBytes()
        inputStream.close()
        
        val contentValues = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "FieldWorker_$fileName")
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/FieldWorker")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
        }
        
        val uri = context.contentResolver.insert(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            contentValues
        )
        
        uri?.let {
            context.contentResolver.openOutputStream(it)?.use { outputStream ->
                outputStream.write(bytes)
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentValues.clear()
                contentValues.put(MediaStore.Images.Media.IS_PENDING, 0)
                context.contentResolver.update(uri, contentValues, null, null)
            }
            true
        } ?: false
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }
}
