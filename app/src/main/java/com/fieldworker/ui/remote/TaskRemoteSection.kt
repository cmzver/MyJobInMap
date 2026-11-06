package com.fieldworker.ui.remote

import android.graphics.BitmapFactory
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.fieldworker.data.network.NetworkMonitor
import com.fieldworker.data.remote.generated.TaskPanelResponse
import com.fieldworker.data.repository.RemoteResolutionRepository
import com.fieldworker.data.repository.ScanCode
import com.fieldworker.domain.model.Task
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.utils.accentTextColor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID
import javax.inject.Inject
import com.fieldworker.data.network.toUserMessage

/**
 * Пометка «Панели · N» в шапке карточки заявки — подставляется через
 * CompositionLocal, как блок актов: экран с навигацией даёт её, превью и
 * скриншоты — нет. По нажатию — шторка с панелями и «Решено удалённо».
 */
val LocalTaskRemoteSection: ProvidableCompositionLocal<(@Composable (Task) -> Unit)?> =
    staticCompositionLocalOf { null }

@HiltViewModel
class TaskRemoteViewModel @Inject constructor(
    private val repository: RemoteResolutionRepository,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    data class PanelState(
        val panel: TaskPanelResponse,
        val isBusy: Boolean = false,
        val doorOpen: Boolean? = null,
        val scanCode: ScanCode? = null,
    )

    data class UiState(
        val panels: List<PanelState> = emptyList(),
        val isResolving: Boolean = false,
        /** Разовое сообщение — тост. */
        val message: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var taskId: Long? = null

    /** Один ключ на попытку «Решено удалённо»: повтор не закроет заявку дважды. */
    private var resolveKey: String? = null

    /** Панели адреса — только при связи: управлять дверью без неё нельзя. */
    fun load(task: Task) {
        if (task.id == taskId) return
        taskId = task.id
        resolveKey = null
        _state.value = UiState()
        if (task.addressId == null || !networkMonitor.isCurrentlyOnline()) return
        viewModelScope.launch {
            repository.panels(task.id).onSuccess { panels ->
                if (taskId == task.id) {
                    _state.update { it.copy(panels = panels.sortedWith(panelOrder).map(::PanelState)) }
                }
            }
        }
    }

    fun openDoor(panelId: Long, onTaskChanged: () -> Unit) = panelAction(panelId, onTaskChanged) { panel, task ->
        repository.openDoor(panel, task).map { open ->
            { state: PanelState -> state.copy(doorOpen = open) } to "Дверь открыта"
        }
    }

    fun checkLock(panelId: Long) = panelAction(panelId, null) { panel, _ ->
        repository.lockStatus(panel).map { open ->
            { state: PanelState -> state.copy(doorOpen = open) } to null
        }
    }

    fun requestScanCode(panelId: Long, onTaskChanged: () -> Unit) = panelAction(panelId, onTaskChanged) { panel, task ->
        repository.scanCode(panel, task).map { code ->
            { state: PanelState -> state.copy(scanCode = code) } to null
        }
    }

    /** Кадры с камеры панели раз в секунду — пока поток собирают (открыто окно видео). */
    fun videoFrames(panel: TaskPanelResponse): Flow<Result<ByteArray>> = flow {
        while (true) {
            emit(repository.snapshot(panel))
            delay(VIDEO_FRAME_INTERVAL_MS)
        }
    }

    fun resolve(task: Task, comment: String, onResolved: () -> Unit) {
        if (_state.value.isResolving) return
        val key = resolveKey ?: UUID.randomUUID().toString().also { resolveKey = it }
        _state.update { it.copy(isResolving = true) }
        viewModelScope.launch {
            repository.resolve(task, comment, key)
                .onSuccess {
                    resolveKey = null
                    _state.update { it.copy(isResolving = false, message = "Заявка закрыта как решённая удалённо") }
                    onResolved()
                }
                .onFailure { error ->
                    _state.update { it.copy(isResolving = false, message = error.toUserMessage()) }
                }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    private fun panelAction(
        panelId: Long,
        onTaskChanged: (() -> Unit)?,
        action: suspend (TaskPanelResponse, Long) -> Result<Pair<(PanelState) -> PanelState, String?>>,
    ) {
        val task = taskId ?: return
        val current = _state.value.panels.firstOrNull { it.panel.id == panelId } ?: return
        if (current.isBusy) return
        updatePanel(panelId) { it.copy(isBusy = true) }
        viewModelScope.launch {
            action(current.panel, task)
                .onSuccess { (change, message) ->
                    updatePanel(panelId) { change(it).copy(isBusy = false) }
                    if (message != null) _state.update { it.copy(message = message) }
                    // В истории заявки новая запись — перечитываем карточку
                    onTaskChanged?.invoke()
                }
                .onFailure { error ->
                    updatePanel(panelId) { it.copy(isBusy = false) }
                    _state.update { it.copy(message = error.toUserMessage()) }
                    onTaskChanged?.invoke()
                }
        }
    }

    private fun updatePanel(panelId: Long, change: (PanelState) -> PanelState) = _state.update { state ->
        state.copy(panels = state.panels.map { if (it.panel.id == panelId) change(it) else it })
    }

    private companion object {
        const val VIDEO_FRAME_INTERVAL_MS = 1_000L

        /** По номеру подъезда: 1, 2, …, 10 — а не 1, 10, 2. */
        val panelOrder = compareBy<TaskPanelResponse>(
            { (it.entrance ?: it.label)?.let { text -> Regex("\\d+").find(text)?.value?.toIntOrNull() } ?: Int.MAX_VALUE },
            { it.id },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskRemoteSection(
    task: Task,
    onTaskChanged: () -> Unit,
    viewModel: TaskRemoteViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    var sheetOpen by rememberSaveable { mutableStateOf(false) }
    var confirmDoor by rememberSaveable { mutableStateOf<Long?>(null) }
    var videoPanel by rememberSaveable { mutableStateOf<Long?>(null) }
    var resolveOpen by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(task.id) { viewModel.load(task) }
    LaunchedEffect(state.message) {
        state.message?.let {
            Toast.makeText(context, it, Toast.LENGTH_SHORT).show()
            viewModel.consumeMessage()
        }
    }
    if (state.panels.isEmpty()) return

    TaskPanelsBadge(count = state.panels.size, onClick = { sheetOpen = true })

    if (sheetOpen) {
        ModalBottomSheet(onDismissRequest = { sheetOpen = false }) {
            TaskRemoteContent(
                panels = state.panels,
                canResolve = task.status == TaskStatus.NEW || task.status == TaskStatus.IN_PROGRESS,
                onOpenDoor = { confirmDoor = it },
                onCheckLock = viewModel::checkLock,
                onScanCode = { viewModel.requestScanCode(it, onTaskChanged) },
                onVideo = { videoPanel = it },
                onResolve = {
                    sheetOpen = false
                    resolveOpen = true
                },
            )
        }
    }

    confirmDoor?.let { panelId ->
        val title = state.panels.firstOrNull { it.panel.id == panelId }?.panel?.let(::panelTitle).orEmpty()
        AlertDialog(
            onDismissRequest = { confirmDoor = null },
            title = { Text("Открыть дверь?") },
            text = { Text("Это физически откроет дверь — «$title». Действие запишется в историю заявки.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDoor = null
                        viewModel.openDoor(panelId, onTaskChanged)
                    },
                ) { Text("Открыть") }
            },
            dismissButton = { TextButton(onClick = { confirmDoor = null }) { Text("Отмена") } },
        )
    }

    videoPanel?.let { panelId ->
        state.panels.firstOrNull { it.panel.id == panelId }?.panel?.let { panel ->
            val frames = remember(panel.id) { viewModel.videoFrames(panel) }
            PanelVideoDialog(title = panelTitle(panel), frames = frames, onDismiss = { videoPanel = null })
        }
    }

    if (resolveOpen) {
        ResolveDialog(
            isResolving = state.isResolving,
            onConfirm = { comment ->
                viewModel.resolve(task, comment) {
                    resolveOpen = false
                    onTaskChanged()
                }
            },
            onDismiss = { resolveOpen = false },
        )
    }
}

internal fun panelTitle(panel: TaskPanelResponse): String =
    panel.label ?: panel.entrance?.let { "Подъезд $it" } ?: "Панель ${panel.id}"

/** Пометка в шапке заявки: на адресе есть сетевые панели. */
@Composable
internal fun TaskPanelsBadge(count: Int, onClick: () -> Unit) {
    Text(
        text = "Панели · $count",
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = accentTextColor(),
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 2.dp),
    )
}

/** Содержимое шторки без ViewModel — для превью и скриншотов. Панель — одна строка. */
@Composable
internal fun TaskRemoteContent(
    panels: List<TaskRemoteViewModel.PanelState>,
    canResolve: Boolean,
    onOpenDoor: (Long) -> Unit,
    onCheckLock: (Long) -> Unit,
    onScanCode: (Long) -> Unit,
    onVideo: (Long) -> Unit,
    onResolve: () -> Unit,
) {
    Column(modifier = Modifier.navigationBarsPadding()) {
        Text(
            text = "Сетевые панели",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 4.dp),
        )
        LazyColumn(modifier = Modifier.fillMaxWidth().weight(1f, fill = false)) {
            items(panels, key = { it.panel.id }) { state ->
                PanelRow(state, onOpenDoor, onCheckLock, onScanCode, onVideo)
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
            }
        }
        if (canResolve) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Помогли без выезда — закройте заявку",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onResolve) { Text("Решено удалённо") }
            }
        }
    }
}

@Composable
private fun PanelRow(
    state: TaskRemoteViewModel.PanelState,
    onOpenDoor: (Long) -> Unit,
    onCheckLock: (Long) -> Unit,
    onScanCode: (Long) -> Unit,
    onVideo: (Long) -> Unit,
) {
    val panel = state.panel
    val compactButton = PaddingValues(horizontal = 8.dp)
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = panelTitle(panel),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val details = listOfNotNull(
                panel.model,
                state.doorOpen?.let { if (it) "дверь открыта" else "дверь закрыта" },
            ).joinToString(" · ")
            if (details.isNotEmpty()) {
                Text(
                    text = details,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            // Код ключей — своей строкой: его диктуют жильцу, обрезать нельзя
            state.scanCode?.let { scan ->
                Text(
                    text = buildAnnotatedString {
                        append("код ")
                        withStyle(SpanStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold)) {
                            append(scan.code ?: "—")
                        }
                        if (!scan.active) append(" (выкл.)")
                    },
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        FilledTonalButton(
            onClick = { onOpenDoor(panel.id) },
            enabled = !state.isBusy,
            contentPadding = PaddingValues(horizontal = 12.dp),
            modifier = Modifier.height(34.dp).widthIn(min = 88.dp),
        ) {
            if (state.isBusy) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
            } else {
                Text("Открыть")
            }
        }
        TextButton(onClick = { onCheckLock(panel.id) }, enabled = !state.isBusy, contentPadding = compactButton) {
            Text("Замок")
        }
        TextButton(onClick = { onScanCode(panel.id) }, enabled = !state.isBusy, contentPadding = compactButton) {
            Text("Код")
        }
        TextButton(onClick = { onVideo(panel.id) }, contentPadding = compactButton) { Text("Видео") }
    }
}

private sealed interface VideoFrame {
    data object Loading : VideoFrame
    data class Image(val bitmap: ImageBitmap) : VideoFrame
    data class Error(val text: String) : VideoFrame
}

/** Видео с камеры панели: кадр раз в секунду, запросы идут только пока окно открыто. */
@Composable
private fun PanelVideoDialog(title: String, frames: Flow<Result<ByteArray>>, onDismiss: () -> Unit) {
    val frame by produceState<VideoFrame>(VideoFrame.Loading, frames) {
        frames.collect { result ->
            val bitmap = result.getOrNull()?.let { bytes ->
                withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() }
            }
            value = when {
                bitmap != null -> VideoFrame.Image(bitmap)
                // Сбой одного кадра не гасит уже показанную картинку
                value is VideoFrame.Image -> value
                else -> VideoFrame.Error(result.exceptionOrNull()?.toUserMessage("Панель не вернула кадр") ?: "Панель не вернула кадр")
            }
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Видео — $title") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.Black),
                    contentAlignment = Alignment.Center,
                ) {
                    when (val current = frame) {
                        VideoFrame.Loading -> CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp)
                        is VideoFrame.Image -> Image(
                            bitmap = current.bitmap,
                            contentDescription = "Кадр с камеры панели",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        is VideoFrame.Error -> Text(
                            text = current.text,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(16.dp),
                        )
                    }
                }
                Text(
                    text = "Кадр обновляется раз в секунду",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Закрыть") } },
    )
}

@Composable
private fun ResolveDialog(isResolving: Boolean, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var comment by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Решено удалённо") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Заявка закроется без выезда; если никто не назначен — на вас.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedTextField(
                    value = comment,
                    onValueChange = { comment = it },
                    label = { Text("Что сделали") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(comment.trim()) },
                enabled = comment.trim().length >= 3 && !isResolving,
            ) { Text("Закрыть заявку") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
    )
}
