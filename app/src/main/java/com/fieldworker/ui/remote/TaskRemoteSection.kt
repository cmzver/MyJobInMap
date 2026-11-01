package com.fieldworker.ui.remote

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
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
import com.fieldworker.ui.list.TaskSectionCard
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/**
 * Блок «Удалённо» в карточке заявки — подставляется через CompositionLocal,
 * как блок актов: экран с навигацией даёт его, превью и скриншоты — нет.
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
                if (taskId == task.id) _state.update { it.copy(panels = panels.map(::PanelState)) }
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

    fun snapshotToPhotos(panelId: Long, onTaskChanged: () -> Unit) = panelAction(panelId, onTaskChanged) { panel, task ->
        repository.snapshotToPhotos(panel, task).map {
            { state: PanelState -> state } to "Кадр с панели добавлен в фото"
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
                    _state.update { it.copy(isResolving = false, message = error.message) }
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
                    // В истории заявки новая запись (или фото) — перечитываем карточку
                    onTaskChanged?.invoke()
                }
                .onFailure { error ->
                    updatePanel(panelId) { it.copy(isBusy = false) }
                    _state.update { it.copy(message = error.message) }
                    onTaskChanged?.invoke()
                }
        }
    }

    private fun updatePanel(panelId: Long, change: (PanelState) -> PanelState) = _state.update { state ->
        state.copy(panels = state.panels.map { if (it.panel.id == panelId) change(it) else it })
    }
}

@Composable
fun TaskRemoteSection(
    task: Task,
    onTaskChanged: () -> Unit,
    viewModel: TaskRemoteViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    var confirmDoor by rememberSaveable { mutableStateOf<Long?>(null) }
    var resolveOpen by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(task.id) { viewModel.load(task) }
    LaunchedEffect(state.message) {
        state.message?.let {
            Toast.makeText(context, it, Toast.LENGTH_SHORT).show()
            viewModel.consumeMessage()
        }
    }
    if (state.panels.isEmpty()) return

    TaskRemoteContent(
        panels = state.panels,
        canResolve = task.status == TaskStatus.NEW || task.status == TaskStatus.IN_PROGRESS,
        onOpenDoor = { confirmDoor = it },
        onCheckLock = viewModel::checkLock,
        onScanCode = { viewModel.requestScanCode(it, onTaskChanged) },
        onSnapshot = { viewModel.snapshotToPhotos(it, onTaskChanged) },
        onResolve = { resolveOpen = true },
    )

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

/** Содержимое блока без ViewModel — для превью и скриншотов. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TaskRemoteContent(
    panels: List<TaskRemoteViewModel.PanelState>,
    canResolve: Boolean,
    onOpenDoor: (Long) -> Unit,
    onCheckLock: (Long) -> Unit,
    onScanCode: (Long) -> Unit,
    onSnapshot: (Long) -> Unit,
    onResolve: () -> Unit,
) {
    TaskSectionCard(
        title = "Удалённо",
        action = if (canResolve) {
            { TextButton(onClick = onResolve) { Text("Решено удалённо") } }
        } else {
            null
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            panels.forEach { state ->
                val panel = state.panel
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = panelTitle(panel),
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.SemiBold,
                            )
                            val details = listOfNotNull(
                                panel.model,
                                state.doorOpen?.let { if (it) "дверь открыта" else "дверь закрыта" },
                            )
                            if (details.isNotEmpty()) {
                                Text(
                                    text = details.joinToString(" · "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        if (state.isBusy) CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    }
                    state.scanCode?.let { scan ->
                        Text(
                            text = buildAnnotatedString {
                                append("Код записи ключей: ")
                                withStyle(SpanStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold)) {
                                    append(scan.code ?: "—")
                                }
                                if (!scan.active) append(" (режим выключен на панели)")
                            },
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Button(onClick = { onOpenDoor(panel.id) }, enabled = !state.isBusy) { Text("Открыть дверь") }
                        TextButton(onClick = { onCheckLock(panel.id) }, enabled = !state.isBusy) { Text("Замок") }
                        TextButton(onClick = { onScanCode(panel.id) }, enabled = !state.isBusy) { Text("Код ключей") }
                        TextButton(onClick = { onSnapshot(panel.id) }, enabled = !state.isBusy) { Text("Кадр в фото") }
                    }
                }
            }
        }
    }
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
