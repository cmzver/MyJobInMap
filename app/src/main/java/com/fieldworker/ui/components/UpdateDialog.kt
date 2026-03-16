package com.fieldworker.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.fieldworker.data.dto.UpdateInfoDto

/**
 * Состояние процесса обновления
 */
sealed class UpdateState {
    /** Проверка обновлений */
    data object Checking : UpdateState()

    /** Обновлений нет */
    data class UpToDate(val versionName: String) : UpdateState()
    
    /** Доступно обновление */
    data class Available(val info: UpdateInfoDto) : UpdateState()
    
    /** Идёт загрузка APK */
    data class Downloading(val progress: Int) : UpdateState()
    
    /** Загрузка завершена, готово к установке */
    data object ReadyToInstall : UpdateState()
    
    /** Ошибка */
    data class Error(val message: String) : UpdateState()
}

/**
 * Диалог обновления приложения.
 * 
 * Показывается когда доступна новая версия. Поддерживает:
 * - Отображение информации о версии и release notes
 * - Прогресс загрузки APK с возможностью отмены
 * - Обязательные обновления (нельзя закрыть)
 */
@Composable
fun UpdateDialog(
    state: UpdateState,
    onDismiss: () -> Unit,
    onDownload: () -> Unit,
    onInstall: () -> Unit,
    onCancelDownload: () -> Unit = {}
) {
    when (state) {
        is UpdateState.Available -> {
            AlertDialog(
                onDismissRequest = {
                    if (!state.info.isMandatory) onDismiss()
                },
                icon = {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                },
                title = {
                    Text(
                        text = "Доступно обновление",
                        fontWeight = FontWeight.Bold
                    )
                },
                text = {
                    Column(
                        modifier = Modifier.verticalScroll(rememberScrollState())
                    ) {
                        Text(
                            text = "Версия ${state.info.versionName}",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                        
                        if (state.info.fileSize != null && state.info.fileSize > 0) {
                            Text(
                                text = formatFileSize(state.info.fileSize),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        
                        if (state.info.releaseNotes.isNotBlank()) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = "Что нового:",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = state.info.releaseNotes,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                        
                        if (state.info.isMandatory) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = "⚠ Это обязательное обновление",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                },
                confirmButton = {
                    Button(onClick = onDownload) {
                        Text("Обновить")
                    }
                },
                dismissButton = {
                    if (!state.info.isMandatory) {
                        TextButton(onClick = onDismiss) {
                            Text("Позже")
                        }
                    }
                }
            )
        }
        
        is UpdateState.Downloading -> {
            AlertDialog(
                onDismissRequest = { /* нельзя закрыть во время загрузки */ },
                icon = {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                },
                title = {
                    Text("Загрузка обновления...")
                },
                text = {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        LinearProgressIndicator(
                            progress = { state.progress / 100f },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "${state.progress}%",
                            style = MaterialTheme.typography.bodyLarge,
                            textAlign = TextAlign.Center
                        )
                    }
                },
                confirmButton = { },
                dismissButton = {
                    TextButton(onClick = onCancelDownload) {
                        Text("Отмена")
                    }
                }
            )
        }
        
        is UpdateState.ReadyToInstall -> {
            AlertDialog(
                onDismissRequest = { },
                icon = {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                },
                title = {
                    Text("Обновление загружено")
                },
                text = {
                    Text("Нажмите \"Установить\" чтобы обновить приложение.")
                },
                confirmButton = {
                    Button(onClick = onInstall) {
                        Text("Установить")
                    }
                },
                dismissButton = {
                    TextButton(onClick = onDismiss) {
                        Text("Позже")
                    }
                }
            )
        }
        
        is UpdateState.Error -> {
            AlertDialog(
                onDismissRequest = onDismiss,
                title = {
                    Text("Ошибка обновления")
                },
                text = {
                    Text(state.message)
                },
                confirmButton = {
                    TextButton(onClick = onDismiss) {
                        Text("OK")
                    }
                }
            )
        }

        is UpdateState.UpToDate -> {
            AlertDialog(
                onDismissRequest = onDismiss,
                title = {
                    Text("Обновления не найдены")
                },
                text = {
                    Text("У вас уже установлена актуальная версия ${state.versionName}.")
                },
                confirmButton = {
                    TextButton(onClick = onDismiss) {
                        Text("OK")
                    }
                }
            )
        }
        
        else -> { /* Checking state — не показываем диалог */ }
    }
}

/**
 * Форматирование размера файла
 */
private fun formatFileSize(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes Б"
        bytes < 1024 * 1024 -> "${bytes / 1024} КБ"
        else -> String.format("%.1f МБ", bytes / (1024.0 * 1024.0))
    }
}
