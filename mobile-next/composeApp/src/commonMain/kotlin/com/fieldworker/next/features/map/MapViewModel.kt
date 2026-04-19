package com.fieldworker.next.features.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.next.domain.model.TaskSummary
import com.fieldworker.next.domain.usecase.ObserveTaskBoardUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MapUiState(
    val tasks: List<TaskSummary> = emptyList(),
    val isLoading: Boolean = true,
    val selectedTask: TaskSummary? = null,
)

class MapViewModel(
    private val observeTaskBoardUseCase: ObserveTaskBoardUseCase,
) : ViewModel() {

    private val _state = MutableStateFlow(MapUiState())
    val state: StateFlow<MapUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            observeTaskBoardUseCase().collect { board ->
                val allActive = board.needsAction + board.inProgress
                _state.update {
                    it.copy(
                        tasks = allActive,
                        isLoading = false,
                    )
                }
            }
        }
    }

    fun selectTask(task: TaskSummary?) {
        _state.update { it.copy(selectedTask = task) }
    }
}
