package com.fieldworker.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.fieldworker.data.remote.generated.AppUpdateInfo
import com.fieldworker.ui.theme.AppShape
import com.fieldworker.ui.utils.accentTextColor
import java.util.Locale

/**
 * Состояние процесса обновления
 */
sealed class UpdateState {
    /** Проверка обновлений */
    data object Checking : UpdateState()

    /** Обновлений нет */
    data class UpToDate(val versionName: String) : UpdateState()

    /** Доступно обновление */
    data class Available(val info: AppUpdateInfo) : UpdateState()

    /** Идёт загрузка APK: [totalBytes] ≤ 0 — размер неизвестен */
    data class Downloading(
        val versionName: String? = null,
        val downloadedBytes: Long = 0,
        val totalBytes: Long = 0,
    ) : UpdateState() {
        val percent: Int?
            get() = if (totalBytes > 0) (downloadedBytes * 100 / totalBytes).toInt().coerceIn(0, 100) else null
    }

    /** Загрузка завершена, готово к установке */
    data class ReadyToInstall(val versionName: String? = null) : UpdateState()

    /** Ошибка; [canRetryDownload] — упала загрузка, её можно повторить с панели */
    data class Error(val message: String, val canRetryDownload: Boolean = false) : UpdateState()
}

/** Панель снизу показывает это состояние (а не модальный диалог). */
val UpdateState.showsInBanner: Boolean
    get() = this is UpdateState.Available ||
        this is UpdateState.Downloading ||
        this is UpdateState.ReadyToInstall ||
        (this is UpdateState.Error && canRetryDownload)

/**
 * Ответы на ручную проверку обновлений — короткие диалоги. Сам процесс
 * обновления (есть версия → загрузка → установка) — в [UpdateBanner].
 */
@Composable
fun UpdateDialog(
    state: UpdateState,
    onDismiss: () -> Unit,
) {
    when (state) {
        is UpdateState.Error -> if (!state.canRetryDownload) {
            AlertDialog(
                onDismissRequest = onDismiss,
                title = { Text("Не удалось проверить обновления") },
                text = { Text(state.message) },
                confirmButton = { TextButton(onClick = onDismiss) { Text("Понятно") } },
            )
        }

        is UpdateState.UpToDate -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Обновлений нет") },
            text = { Text("Установлена актуальная версия ${state.versionName}.") },
            confirmButton = { TextButton(onClick = onDismiss) { Text("Понятно") } },
        )

        else -> Unit
    }
}

/**
 * Обновление приложения — панелью внизу, над нижней навигацией: не мешает
 * работать, пока качается. Один блок на весь путь: «доступна версия» →
 * «загружено 7,3 из 19,7 МБ» → «установить». Первая строка — что происходит,
 * вторая — действие, чтобы кнопка не съедала заголовок.
 */
@Composable
fun UpdateBanner(
    state: UpdateState,
    onDismiss: () -> Unit,
    onDownload: () -> Unit,
    onInstall: () -> Unit,
    onCancelDownload: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!state.showsInBanner) return
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .animateContentSize(),
        shape = AppShape.lg,
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 6.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(modifier = Modifier.padding(start = 14.dp, end = 8.dp, top = 10.dp, bottom = 10.dp)) {
            when (state) {
                is UpdateState.Available -> AvailableContent(state.info, onDismiss, onDownload)
                is UpdateState.Downloading -> DownloadingContent(state, onCancelDownload)
                is UpdateState.ReadyToInstall -> {
                    BannerHeader(
                        title = listOfNotNull("Обновление", state.versionName, "загружено").joinToString(" "),
                        subtitle = "Установка займёт несколько секунд",
                        trailing = { CloseButton(onDismiss) },
                    )
                    BannerActions { Button(onClick = onInstall) { Text("Установить") } }
                }
                is UpdateState.Error -> {
                    BannerHeader(
                        title = "Не удалось загрузить обновление",
                        subtitle = state.message,
                        trailing = { CloseButton(onDismiss) },
                    )
                    BannerActions { Button(onClick = onDownload) { Text("Повторить") } }
                }
                else -> Unit
            }
        }
    }
}

@Composable
private fun AvailableContent(info: AppUpdateInfo, onDismiss: () -> Unit, onDownload: () -> Unit) {
    val mandatory = info.isMandatory == true
    val notes = info.releaseNotes?.takeIf { it.isNotBlank() }
    var expanded by rememberSaveable { mutableStateOf(false) }
    val subtitle = buildList {
        info.fileSize?.takeIf { it > 0 }?.let { add(formatMegabytes(it)) }
        if (mandatory) add("обязательное")
    }.joinToString(" · ")

    BannerHeader(
        title = "Доступна версия ${info.versionName}",
        subtitle = subtitle.ifEmpty { null },
        // Обязательное обновление не откладывается
        trailing = if (mandatory) null else ({ CloseButton(onDismiss) }),
    )
    BannerActions(
        leading = if (notes == null) null else ({
            Row(
                modifier = Modifier
                    .clip(AppShape.sm)
                    .clickable { expanded = !expanded }
                    .padding(vertical = 6.dp, horizontal = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Что нового",
                    style = MaterialTheme.typography.labelLarge,
                    color = accentTextColor(),
                )
                Icon(
                    imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = null,
                    tint = accentTextColor(),
                    modifier = Modifier.size(18.dp),
                )
            }
        }),
    ) {
        Button(onClick = onDownload) { Text("Обновить") }
    }
    if (notes != null) {
        val notesText: String = notes
        AnimatedVisibility(visible = expanded) {
            Text(
                text = notesText,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .padding(start = CONTENT_INSET, end = 8.dp, top = 6.dp)
                    .heightIn(max = 220.dp)
                    .verticalScroll(rememberScrollState()),
            )
        }
    }
}

@Composable
private fun DownloadingContent(state: UpdateState.Downloading, onCancel: () -> Unit) {
    val percent = state.percent
    BannerHeader(
        title = listOfNotNull("Обновление", state.versionName).joinToString(" "),
        subtitle = "Загружено ${downloadedText(state)}",
        trailing = { TextButton(onClick = onCancel) { Text("Отмена") } },
    )
    Spacer(modifier = Modifier.height(8.dp))
    val trackModifier = Modifier
        .padding(start = CONTENT_INSET, end = 8.dp)
        .fillMaxWidth()
        .height(6.dp)
        .clip(AppShape.pill)
    if (percent != null) {
        LinearProgressIndicator(
            progress = { percent / 100f },
            modifier = trackModifier,
            strokeCap = StrokeCap.Round,
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
            gapSize = 0.dp,
            drawStopIndicator = {},
        )
    } else {
        // Размер неизвестен — бегущая полоса, мегабайты всё равно растут
        LinearProgressIndicator(
            modifier = trackModifier,
            strokeCap = StrokeCap.Round,
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
        )
    }
    Spacer(modifier = Modifier.height(4.dp))
}

/** «7,3 из 19,7 МБ · 37 %», без размера — «7,3 МБ». */
internal fun downloadedText(state: UpdateState.Downloading): String {
    val percent = state.percent
    return if (percent != null) {
        "${formatMegabytesValue(state.downloadedBytes)} из ${formatMegabytes(state.totalBytes)} · $percent %"
    } else {
        formatMegabytes(state.downloadedBytes)
    }
}

/** Отступ содержимого под иконкой шапки: 30 dp иконка + 10 dp зазор. */
private val CONTENT_INSET = 40.dp

@Composable
private fun BannerHeader(
    title: String,
    subtitle: String?,
    trailing: (@Composable () -> Unit)?,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(30.dp)
                .clip(AppShape.sm)
                .background(MaterialTheme.colorScheme.surfaceContainerHighest),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Default.Refresh,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (trailing != null) {
            Spacer(modifier = Modifier.width(4.dp))
            trailing()
        }
    }
}

/** Вторая строка панели: слева — ссылка (если есть), справа — главное действие. */
@Composable
private fun BannerActions(
    leading: (@Composable () -> Unit)? = null,
    action: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = CONTENT_INSET, end = 6.dp, top = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading?.invoke()
        Spacer(modifier = Modifier.weight(1f))
        action()
    }
}

@Composable
private fun CloseButton(onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(36.dp)) {
        Icon(
            imageVector = Icons.Default.Close,
            contentDescription = "Скрыть",
            modifier = Modifier.size(18.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private val RU = Locale.forLanguageTag("ru")
private const val MB = 1024.0 * 1024.0

/** «19,7 МБ»; меньше мегабайта — «0,4 МБ». */
internal fun formatMegabytes(bytes: Long): String = "${formatMegabytesValue(bytes)} МБ"

internal fun formatMegabytesValue(bytes: Long): String =
    String.format(RU, "%.1f", bytes.coerceAtLeast(0) / MB)
