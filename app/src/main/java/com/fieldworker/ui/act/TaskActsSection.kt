package com.fieldworker.ui.act

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.fieldworker.data.remote.generated.ActResponse
import com.fieldworker.data.repository.ActsRepository
import com.fieldworker.domain.model.PendingAct
import com.fieldworker.domain.model.Task
import com.fieldworker.ui.list.OfflineSectionNote
import com.fieldworker.ui.list.SectionSpinner
import com.fieldworker.ui.list.TaskSectionCard
import com.fieldworker.ui.utils.TaskUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

/**
 * Блок «Акты» в карточке заявки. Подставляется через CompositionLocal: экран
 * с навигацией даёт его, а превью и скриншот-тесты (без Hilt) — нет.
 */
val LocalTaskActsSection: ProvidableCompositionLocal<(@Composable (Task) -> Unit)?> =
    staticCompositionLocalOf { null }

@HiltViewModel
class TaskActsViewModel @Inject constructor(
    private val actsRepository: ActsRepository,
) : ViewModel() {

    /** Акты с сервера: null — ещё не загружены; unavailable — нет связи. */
    data class ServerActs(val acts: List<ActResponse>? = null, val unavailable: Boolean = false)

    private val taskId = MutableStateFlow<Long?>(null)
    private val _serverActs = MutableStateFlow(ServerActs())
    val serverActs: StateFlow<ServerActs> = _serverActs.asStateFlow()

    @OptIn(ExperimentalCoroutinesApi::class)
    val pendingActs: StateFlow<List<PendingAct>> = taskId.filterNotNull()
        .flatMapLatest { actsRepository.pendingActsFlow(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun load(id: Long) {
        if (taskId.value != id) {
            taskId.value = id
            _serverActs.value = ServerActs()
        }
        refresh()
    }

    fun refresh() {
        val id = taskId.value ?: return
        viewModelScope.launch {
            actsRepository.taskActs(id)
                .onSuccess { _serverActs.value = ServerActs(acts = it) }
                .onFailure {
                    _serverActs.value = _serverActs.value.copy(unavailable = true)
                }
        }
    }

    fun openPdf(act: ActResponse, onReady: (File) -> Unit, onError: (String) -> Unit) {
        viewModelScope.launch {
            actsRepository.downloadPdf(act)
                .onSuccess(onReady)
                .onFailure { onError(it.message ?: "PDF недоступен") }
        }
    }
}

@Composable
fun TaskActsSection(
    task: Task,
    onCreateAct: () -> Unit,
    viewModel: TaskActsViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val serverActs by viewModel.serverActs.collectAsStateWithLifecycle()
    val pendingActs by viewModel.pendingActs.collectAsStateWithLifecycle()

    LaunchedEffect(task.id) { viewModel.load(task.id) }
    // Акт ушёл из очереди — значит, выпущен: подтягиваем его номер с сервера
    var queued by remember { mutableIntStateOf(0) }
    LaunchedEffect(pendingActs.size) {
        if (pendingActs.size < queued) viewModel.refresh()
        queued = pendingActs.size
    }

    TaskActsContent(
        pendingActs = pendingActs,
        serverActs = serverActs,
        onCreateAct = onCreateAct,
        onOpenPdf = { act ->
            viewModel.openPdf(
                act,
                onReady = { file -> openPdf(context, file) },
                onError = { message -> Toast.makeText(context, message, Toast.LENGTH_SHORT).show() },
            )
        },
    )
}

/** Содержимое блока без ViewModel — для превью и скриншотов. */
@Composable
internal fun TaskActsContent(
    pendingActs: List<PendingAct>,
    serverActs: TaskActsViewModel.ServerActs,
    onCreateAct: () -> Unit,
    onOpenPdf: (ActResponse) -> Unit,
) {
    TaskSectionCard(
        title = "Акты",
        action = {
            TextButton(onClick = onCreateAct) { Text("Оформить") }
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            pendingActs.forEach { act -> PendingActRow(act) }
            val acts = serverActs.acts
            when {
                acts == null && serverActs.unavailable && pendingActs.isEmpty() ->
                    OfflineSectionNote("Акты загрузятся, когда появится связь.")
                acts == null && !serverActs.unavailable -> SectionSpinner()
                acts.isNullOrEmpty() && pendingActs.isEmpty() -> Text(
                    text = "Актов нет. Оформите акт и дайте заказчику подписать его на экране.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> acts.orEmpty().forEach { act ->
                    ServerActRow(act = act, onOpen = { onOpenPdf(act) })
                }
            }
        }
    }
}

@Composable
private fun PendingActRow(act: PendingAct) {
    Column {
        Text(
            text = "Акт · ${formatRub(act.total)} · ${act.kind.label}",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = if (act.isFailed) {
                "Не отправлен — откройте «Не отправлено», чтобы повторить"
            } else {
                "Отправится при связи, номер присвоит сервер"
            },
            style = MaterialTheme.typography.bodySmall,
            color = if (act.isFailed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ServerActRow(act: ActResponse, onOpen: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "№${act.number} · ${formatRub(act.totalAmount)}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "${statusLabel(act.status)} · ${TaskUtils.formatShortDate(act.createdAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        TextButton(onClick = onOpen) { Text("PDF") }
    }
}

private fun statusLabel(status: ActResponse.Status): String = when (status) {
    ActResponse.Status.PENDING_SIGNATURE -> "ждёт подписи"
    ActResponse.Status.SIGNED -> "подписан"
    ActResponse.Status.REFUSED -> "отказ от подписи"
    ActResponse.Status.CANCELLED -> "аннулирован"
}

private fun openPdf(context: Context, file: File) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/pdf")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(Intent.createChooser(intent, "Открыть акт").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(context, "Нет приложения для просмотра PDF", Toast.LENGTH_SHORT).show()
    }
}
