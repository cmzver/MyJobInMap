package com.fieldworker.next.features.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.next.domain.model.TaskBoard
import com.fieldworker.next.domain.model.TaskSummary
import com.fieldworker.next.domain.usecase.ObserveTaskBoardUseCase
import com.fieldworker.next.domain.usecase.RefreshTasksUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

enum class TaskFilter(val title: String) {
    All("Все"),
    New("Новые"),
    InProgress("В работе"),
}

data class TaskListUiState(
    val board: TaskBoard = TaskBoard.EMPTY,
    val filter: TaskFilter = TaskFilter.All,
    val searchQuery: String = "",
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
) {
    val visibleTasks: List<TaskSummary>
        get() {
            val filtered = when (filter) {
                TaskFilter.All -> board.needsAction + board.inProgress
                TaskFilter.New -> board.needsAction
                TaskFilter.InProgress -> board.inProgress
            }
            return if (searchQuery.isBlank()) filtered
            else filtered.filter { task ->
                task.title.contains(searchQuery, ignoreCase = true) ||
                    task.address.contains(searchQuery, ignoreCase = true) ||
                    task.number.contains(searchQuery, ignoreCase = true)
            }
        }
}

class TaskListViewModel(
    observeTaskBoardUseCase: ObserveTaskBoardUseCase,
    private val refreshTasksUseCase: RefreshTasksUseCase,
) : ViewModel() {

    private val _filter = MutableStateFlow(TaskFilter.All)
    private val _searchQuery = MutableStateFlow("")
    private val _isRefreshing = MutableStateFlow(false)
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    val state: StateFlow<TaskListUiState> = combine(
        observeTaskBoardUseCase(),
        _filter,
        _searchQuery,
        _isRefreshing,
    ) { board, filter, query, refreshing ->
        TaskListUiState(
            board = board,
            filter = filter,
            searchQuery = query,
            isLoading = false,
            isRefreshing = refreshing,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = TaskListUiState(),
    )

    fun onFilterChanged(filter: TaskFilter) {
        _filter.value = filter
    }

    fun onSearchQueryChanged(query: String) {
        _searchQuery.value = query
    }

    fun refresh() {
        viewModelScope.launch {
            _isRefreshing.value = true
            refreshTasksUseCase()
            _isRefreshing.value = false
        }
    }
}
