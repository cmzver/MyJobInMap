package com.fieldworker.next.features.tasks

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.rounded.AddAPhoto
import androidx.compose.material.icons.rounded.BrokenImage
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material.icons.rounded.CalendarToday
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.fieldworker.next.util.rememberImagePickerLauncher
import com.fieldworker.next.core.designsystem.FwAvatar
import com.fieldworker.next.core.designsystem.FwButton
import com.fieldworker.next.core.designsystem.FwButtonStyle
import com.fieldworker.next.core.designsystem.FwCard
import com.fieldworker.next.core.designsystem.FwColors
import com.fieldworker.next.core.designsystem.FwListSkeleton
import com.fieldworker.next.core.designsystem.FwStatusChip
import com.fieldworker.next.core.designsystem.FwTheme
import com.fieldworker.next.core.designsystem.FwTopBar
import com.fieldworker.next.domain.model.TaskComment
import com.fieldworker.next.domain.model.TaskDetail
import com.fieldworker.next.domain.model.TaskPhoto
import com.fieldworker.next.domain.model.TaskStatus
import org.koin.compose.viewmodel.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailRoute(
    taskId: Long,
    onBack: () -> Unit,
    viewModel: TaskDetailViewModel = koinViewModel(),
) {
    val state by viewModel.state.collectAsState()

    val pickImage = rememberImagePickerLauncher { fileName, bytes, mimeType ->
        viewModel.uploadPhoto(fileName, bytes, mimeType)
    }

    LaunchedEffect(taskId) {
        viewModel.loadTask(taskId)
    }

    Scaffold(
        topBar = {
            FwTopBar(
                title = state.task?.number ?: "Заявка",
                onBack = onBack,
            )
        },
        bottomBar = {
            state.task?.let {
                CommentInputBar(
                    value = state.commentInput,
                    onValueChange = viewModel::onCommentChanged,
                    onSend = viewModel::sendComment,
                    isSending = state.isSending,
                )
            }
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { paddingValues ->
        if (state.isLoading) {
            FwListSkeleton(
                modifier = Modifier.padding(paddingValues).padding(20.dp),
            )
            return@Scaffold
        }

        val task = state.task
        if (task == null) {
            Box(
                modifier = Modifier.fillMaxSize().padding(paddingValues),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Заявка не найдена",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                start = 20.dp, end = 20.dp, top = 8.dp, bottom = 16.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Header card
            item {
                TaskHeaderCard(task)
            }

            // Info section
            item {
                TaskInfoCard(task)
            }

            // Status actions
            item {
                StatusActionsCard(
                    task = task,
                    isSending = state.isSending,
                    onStatusSelected = viewModel::updateStatus,
                )
            }

            // Photos
            item {
                PhotoSectionCard(
                    photos = task.photos,
                    isUploading = state.isUploading,
                    onAddPhoto = pickImage,
                )
            }

            // Error
            state.error?.let { error ->
                item {
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(horizontal = 4.dp),
                    )
                }
            }

            // Comments header
            if (task.comments.isNotEmpty()) {
                item {
                    Text(
                        text = "Комментарии (${task.comments.size})",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }

            // Comments
            items(task.comments, key = TaskComment::id) { comment ->
                CommentBubble(comment = comment)
            }
        }
    }
}

@Composable
private fun TaskHeaderCard(task: TaskDetail) {
    FwCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FwStatusChip(
                    text = statusLabel(task.status),
                    containerColor = statusContainerColor(task.status),
                    contentColor = statusContentColor(task.status),
                )
                FwStatusChip(
                    text = priorityLabel(task.priority),
                    containerColor = priorityContainerColor(task.priority),
                    contentColor = priorityColor(task.priority),
                )
            }
            Text(
                text = task.title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun TaskInfoCard(task: TaskDetail) {
    FwCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // Address
            InfoRow(
                icon = Icons.Rounded.LocationOn,
                label = "Адрес",
                value = task.address,
            )

            HorizontalDivider(color = FwTheme.extended.divider)

            // Description
            if (task.description.isNotBlank()) {
                InfoRow(
                    icon = Icons.Rounded.Description,
                    label = "Описание",
                    value = task.description,
                )
                HorizontalDivider(color = FwTheme.extended.divider)
            }

            // Assignee
            task.assignee?.name?.let { name ->
                InfoRow(
                    icon = null,
                    label = "Исполнитель",
                    value = name,
                )
            }
        }
    }
}

@Composable
private fun InfoRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector?,
    label: String,
    value: String,
) {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        icon?.let {
            Icon(
                imageVector = it,
                contentDescription = null,
                modifier = Modifier.size(18.dp).padding(top = 2.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun StatusActionsCard(
    task: TaskDetail,
    isSending: Boolean,
    onStatusSelected: (TaskStatus) -> Unit,
) {
    if (task.availableTransitions.isEmpty()) return

    FwCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = "Действия",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                task.availableTransitions.forEach { status ->
                    val (style, label) = when (status) {
                        TaskStatus.IN_PROGRESS -> FwButtonStyle.Primary to "Взять в работу"
                        TaskStatus.DONE -> FwButtonStyle.Secondary to "Выполнена"
                        TaskStatus.CANCELLED -> FwButtonStyle.Ghost to "Отменить"
                        else -> FwButtonStyle.Secondary to status.name
                    }
                    FwButton(
                        text = label,
                        onClick = { onStatusSelected(status) },
                        style = style,
                        loading = isSending,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun CommentBubble(comment: TaskComment) {
    val isSystem = comment.isSystemEvent
    val bgColor = if (isSystem) MaterialTheme.colorScheme.surfaceVariant
    else MaterialTheme.colorScheme.surface

    FwCard(containerColor = bgColor, contentPadding = 12.dp) {
        if (isSystem) {
            Text(
                text = comment.message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FwAvatar(
                        name = comment.author,
                        size = com.fieldworker.next.core.designsystem.AvatarSize.Small,
                    )
                    Column {
                        Text(
                            text = comment.author,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = comment.createdAtLabel,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Text(
                    text = comment.message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

@Composable
private fun CommentInputBar(
    value: String,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    isSending: Boolean,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 2.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            TextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.weight(1f),
                placeholder = {
                    Text(
                        "Комментарий...",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                },
                singleLine = false,
                maxLines = 4,
                shape = MaterialTheme.shapes.large,
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
                textStyle = MaterialTheme.typography.bodyMedium,
            )
            IconButton(
                onClick = onSend,
                enabled = value.isNotBlank() && !isSending,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.Send,
                    contentDescription = "Отправить",
                    tint = if (value.isNotBlank() && !isSending)
                        MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                )
            }
        }
    }
}

// ── Helpers ─────────────────────────────────────────────────────

@Composable
private fun PhotoSectionCard(
    photos: List<TaskPhoto>,
    isUploading: Boolean,
    onAddPhoto: () -> Unit,
) {
    FwCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.PhotoLibrary,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = if (photos.isEmpty()) "Фото" else "Фото (${photos.size})",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(photos, key = TaskPhoto::id) { photo ->
                    PhotoThumbnail(photo = photo)
                }
                item(key = "add_photo") {
                    AddPhotoThumbnail(
                        isUploading = isUploading,
                        onClick = onAddPhoto,
                    )
                }
            }
        }
    }
}

@Composable
private fun PhotoThumbnail(photo: TaskPhoto) {
    Box(
        modifier = Modifier
            .size(100.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(
            model = photo.url,
            contentDescription = photo.kind,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )
    }
}

@Composable
private fun AddPhotoThumbnail(
    isUploading: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(100.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(
                width = 1.5.dp,
                color = MaterialTheme.colorScheme.outlineVariant,
                shape = RoundedCornerShape(8.dp),
            )
            .clickable(enabled = !isUploading) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        if (isUploading) {
            CircularProgressIndicator(
                modifier = Modifier.size(28.dp),
                strokeWidth = 2.5.dp,
                color = MaterialTheme.colorScheme.primary,
            )
        } else {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.AddAPhoto,
                    contentDescription = "Добавить фото",
                    modifier = Modifier.size(24.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "Добавить",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ── Label Helpers ───────────────────────────────────────────────

@Composable
private fun statusLabel(status: TaskStatus): String = when (status) {
    TaskStatus.NEW -> "Новая"
    TaskStatus.IN_PROGRESS -> "В работе"
    TaskStatus.DONE -> "Выполнена"
    TaskStatus.CANCELLED -> "Отменена"
}

@Composable
private fun statusContainerColor(status: TaskStatus): Color = when (status) {
    TaskStatus.NEW -> FwColors.Blue50
    TaskStatus.IN_PROGRESS -> Color(0xFFFFF7ED)
    TaskStatus.DONE -> FwColors.Green50
    TaskStatus.CANCELLED -> FwColors.Slate100
}

@Composable
private fun statusContentColor(status: TaskStatus): Color = when (status) {
    TaskStatus.NEW -> FwColors.Blue600
    TaskStatus.IN_PROGRESS -> FwColors.Amber600
    TaskStatus.DONE -> FwColors.Green700
    TaskStatus.CANCELLED -> FwColors.Slate500
}

private fun priorityColor(priority: com.fieldworker.next.domain.model.TaskPriority): Color = when (priority) {
    com.fieldworker.next.domain.model.TaskPriority.EMERGENCY -> FwColors.Red500
    com.fieldworker.next.domain.model.TaskPriority.URGENT -> FwColors.Amber500
    com.fieldworker.next.domain.model.TaskPriority.CURRENT -> FwColors.Blue500
    com.fieldworker.next.domain.model.TaskPriority.PLANNED -> FwColors.Green500
}

private fun priorityContainerColor(priority: com.fieldworker.next.domain.model.TaskPriority): Color = when (priority) {
    com.fieldworker.next.domain.model.TaskPriority.EMERGENCY -> FwColors.Red50
    com.fieldworker.next.domain.model.TaskPriority.URGENT -> FwColors.Amber50
    com.fieldworker.next.domain.model.TaskPriority.CURRENT -> FwColors.Blue50
    com.fieldworker.next.domain.model.TaskPriority.PLANNED -> FwColors.Green50
}

private fun priorityLabel(priority: com.fieldworker.next.domain.model.TaskPriority): String = when (priority) {
    com.fieldworker.next.domain.model.TaskPriority.EMERGENCY -> "Аварийная"
    com.fieldworker.next.domain.model.TaskPriority.URGENT -> "Срочная"
    com.fieldworker.next.domain.model.TaskPriority.CURRENT -> "Текущая"
    com.fieldworker.next.domain.model.TaskPriority.PLANNED -> "Плановая"
}
