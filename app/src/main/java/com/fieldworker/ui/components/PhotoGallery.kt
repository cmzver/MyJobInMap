package com.fieldworker.ui.components

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
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
import androidx.compose.ui.graphics.graphicsLayer
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
import com.fieldworker.domain.model.TaskPhoto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Headers
import java.io.InputStream
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Типы фото для выбора
 */
enum class PhotoType(val value: String, val displayName: String) {
    BEFORE("before", "До работ"),
    AFTER("after", "После работ"),
    COMPLETION("completion", "При завершении")
}

/**
 * Галерея фотографий заявки
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
    modifier: Modifier = Modifier
) {
    var selectedPhoto by remember { mutableStateOf<TaskPhoto?>(null) }
    
    Column(modifier = modifier.fillMaxWidth()) {
        // Заголовок секции
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Info,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Фотографии",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                if (photos.isNotEmpty()) {
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "(${photos.size})",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
            }
        }
        
        Spacer(modifier = Modifier.height(12.dp))
        
        // Галерея
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(vertical = 4.dp)
        ) {
            // Кнопка добавления фото
            item {
                AddPhotoButton(
                    isUploading = isUploading,
                    onClick = onAddPhotoClick
                )
            }
            
            // Фотографии
            items(photos, key = { it.id }) { photo ->
                PhotoThumbnail(
                    photo = photo,
                    baseUrl = baseUrl,
                    authToken = authToken,
                    onClick = { selectedPhoto = photo },
                    onDelete = { onDeletePhoto(photo.id) }
                )
            }
        }
        
        // Плейсхолдер, если нет фото
        if (photos.isEmpty() && !isLoading) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Нет фотографий. Нажмите +, чтобы добавить.",
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
}

/**
 * Диалог подтверждения загрузки фото с выбором типа
 */
@Composable
fun PhotoUploadConfirmDialog(
    photoUri: Uri,
    isUploading: Boolean,
    onUpload: (String) -> Unit,
    onDismiss: () -> Unit
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
                    text = "Загрузка фото",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                
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
                
                // Кнопки выбора типа
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    PhotoType.entries.forEach { type ->
                        FilterChip(
                            selected = selectedType == type,
                            onClick = { selectedType = type },
                            label = { Text(type.displayName, style = MaterialTheme.typography.labelSmall) },
                            modifier = Modifier.weight(1f),
                            enabled = !isUploading
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                // Прогресс загрузки или кнопки
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
                            text = "Загрузка...",
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
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.Send,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Загрузить")
                        }
                    }
                }
            }
        }
    }
}

/**
 * Кнопка добавления фото
 */
@Composable
private fun AddPhotoButton(
    isUploading: Boolean,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .size(80.dp)
            .clickable(enabled = !isUploading) { onClick() },
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
        ),
        border = CardDefaults.outlinedCardBorder()
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            if (isUploading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 2.dp
                )
            } else {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = "Добавить фото",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(32.dp)
                )
            }
        }
    }
}

/**
 * Миниатюра фотографии (без кнопки удаления и подписи)
 */
@Composable
private fun PhotoThumbnail(
    photo: TaskPhoto,
    baseUrl: String,
    authToken: String?,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier
            .size(80.dp)
            .clickable { onClick() },
        shape = MaterialTheme.shapes.medium
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
    val photoTypeDisplay = when (photo.photoType) {
        "before" -> "До работ"
        "after" -> "После работ"
        "completion" -> "При завершении"
        else -> photo.photoType
    }
    
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
