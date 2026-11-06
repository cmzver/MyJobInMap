package com.fieldworker.ui.act

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.data.remote.generated.CatalogItemResponse
import com.fieldworker.data.repository.ActSigningResult
import com.fieldworker.data.repository.ActsRepository
import com.fieldworker.data.repository.OfflineFirstTasksRepository
import com.fieldworker.data.sync.SyncManager
import com.fieldworker.domain.model.ActDraft
import com.fieldworker.domain.model.ActLineDraft
import com.fieldworker.domain.model.Task
import com.fieldworker.ui.utils.extractApartment
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.math.BigDecimal
import javax.inject.Inject
import com.fieldworker.data.network.toUserMessage

/**
 * Оформление акта на телефоне мастера: строки (прайс работает и без сети),
 * заказчик, оплата, затем подпись. Акт уходит офлайн-очередью.
 */
@HiltViewModel
class ActEditorViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val actsRepository: ActsRepository,
    private val tasksRepository: OfflineFirstTasksRepository,
    private val syncManager: SyncManager,
) : ViewModel() {

    enum class Step { EDIT, SIGN }

    data class UiState(
        val task: Task? = null,
        val draft: ActDraft = ActDraft(),
        val catalog: List<CatalogItemResponse> = emptyList(),
        /** Мои остатки по позициям склада (materialId → количество). */
        val stocks: Map<Long, BigDecimal> = emptyMap(),
        val step: Step = Step.EDIT,
        val hasWorkerSignature: Boolean = false,
        val isSubmitting: Boolean = false,
        val isDone: Boolean = false,
        val error: String? = null,
    )

    val taskId: Long = checkNotNull(savedStateHandle.get<Long>(TASK_ID_ARG))

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private var nextLineKey = 1L

    init {
        viewModelScope.launch {
            val task = tasksRepository.getCachedTaskDetail(taskId).getOrNull()?.first
            val hasWorkerSignature = actsRepository.savedWorkerSignature() != null
            _uiState.update { state ->
                state.copy(
                    task = task,
                    draft = state.draft.copy(
                        customerName = task?.customerName.orEmpty(),
                        customerPhone = task?.customerPhone.orEmpty(),
                        apartment = task?.let {
                            extractApartment(it.title) ?: extractApartment(it.description)
                        }.orEmpty(),
                    ),
                    hasWorkerSignature = hasWorkerSignature,
                )
            }
            val catalog = actsRepository.catalog()
            _uiState.update { it.copy(catalog = catalog.filter { item -> item.isActive != false }) }
            if (catalog.any { it.materialId != null }) {
                actsRepository.myStocks().onSuccess { (stocks, _) ->
                    _uiState.update { state ->
                        state.copy(
                            stocks = stocks.associate {
                                it.materialId to (it.quantity.toBigDecimalOrNull() ?: BigDecimal.ZERO)
                            },
                        )
                    }
                }
            }
        }
    }

    fun updateDraft(transform: (ActDraft) -> ActDraft) {
        _uiState.update { it.copy(draft = transform(it.draft)) }
    }

    fun addCatalogItem(item: CatalogItemResponse) = addLine(
        ActLineDraft(
            key = nextLineKey++,
            catalogItemId = item.id,
            isMaterial = item.lineType == CatalogItemResponse.LineType.MATERIAL,
            name = item.name,
            unit = item.unit ?: "усл",
            price = (item.price ?: BigDecimal.ZERO).stripTrailingZeros().toPlainString(),
        )
    )

    fun addFreeLine() = addLine(ActLineDraft(key = nextLineKey++))

    private fun addLine(line: ActLineDraft) = updateDraft { it.copy(lines = it.lines + line) }

    fun updateLine(key: Long, transform: (ActLineDraft) -> ActLineDraft) = updateDraft { draft ->
        draft.copy(lines = draft.lines.map { if (it.key == key) transform(it) else it })
    }

    fun removeLine(key: Long) = updateDraft { draft ->
        draft.copy(lines = draft.lines.filterNot { it.key == key })
    }

    fun goToSigning() {
        if (_uiState.value.draft.canSubmit) _uiState.update { it.copy(step = Step.SIGN) }
    }

    fun backToEditing() = _uiState.update { it.copy(step = Step.EDIT) }

    fun dismissError() = _uiState.update { it.copy(error = null) }

    /**
     * Сохранить акт в очередь. [newWorkerSignature] — подпись мастера,
     * нарисованная сейчас: запоминаем её для следующих актов.
     */
    fun submit(signing: ActSigningResult, newWorkerSignature: ByteArray?) {
        val state = _uiState.value
        if (state.isSubmitting || !state.draft.canSubmit) return
        _uiState.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            newWorkerSignature?.let { actsRepository.saveWorkerSignature(it) }
            val workerSignature = newWorkerSignature ?: actsRepository.savedWorkerSignature()
            actsRepository.enqueueAct(taskId, state.draft, signing, workerSignature)
                .onSuccess {
                    syncManager.triggerImmediateSync()
                    _uiState.update { it.copy(isSubmitting = false, isDone = true) }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(isSubmitting = false, error = error.toUserMessage()) }
                }
        }
    }

    companion object {
        const val TASK_ID_ARG = "taskId"
    }
}
