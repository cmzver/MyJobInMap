package com.fieldworker.next.features.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.next.domain.model.AppResult
import com.fieldworker.next.domain.model.TaskDetail
import com.fieldworker.next.domain.model.TaskStatus
import com.fieldworker.next.domain.usecase.AddTaskCommentUseCase
import com.fieldworker.next.domain.usecase.ObserveTaskDetailUseCase
import com.fieldworker.next.domain.usecase.UpdateTaskStatusUseCase
import com.fieldworker.next.domain.usecase.UploadTaskPhotoUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class TaskDetailUiState(
    val task: TaskDetail? = null,
    val commentInput: String = "",
    val isLoading: Boolean = true,
    val isSending: Boolean = false,
    val isUploading: Boolean = false,
    val error: String? = null,
)

class TaskDetailViewModel(
    private val observeTaskDetailUseCase: ObserveTaskDetailUseCase,
    private val updateTaskStatusUseCase: UpdateTaskStatusUseCase,
    private val addTaskCommentUseCase: AddTaskCommentUseCase,
    private val uploadTaskPhotoUseCase: UploadTaskPhotoUseCase,
) : ViewModel() {

    private val _state = MutableStateFlow(TaskDetailUiState())
    val state: StateFlow<TaskDetailUiState> = _state.asStateFlow()

    fun loadTask(taskId: Long) {
        viewModelScope.launch {
            observeTaskDetailUseCase(taskId).collect { detail ->
                _state.update { it.copy(task = detail, isLoading = false) }
            }
        }
    }

    fun onCommentChanged(value: String) {
        _state.update { it.copy(commentInput = value, error = null) }
    }

    fun updateStatus(status: TaskStatus) {
        val current = _state.value
        val taskId = current.task?.id ?: return
        if (current.isSending) return

        _state.update { it.copy(isSending = true, error = null) }
        viewModelScope.launch {
            val result = updateTaskStatusUseCase(
                taskId = taskId,
                newStatus = status,
                comment = current.commentInput,
            )
            _state.update {
                when (result) {
                    is AppResult.Success -> it.copy(isSending = false)
                    is AppResult.Failure -> it.copy(
                        isSending = false,
                        error = result.error.toString(),
                    )
                }
            }
        }
    }

    fun sendComment() {
        val current = _state.value
        val taskId = current.task?.id ?: return
        if (current.commentInput.isBlank() || current.isSending) return

        _state.update { it.copy(isSending = true, error = null) }
        viewModelScope.launch {
            val result = addTaskCommentUseCase(
                taskId = taskId,
                message = current.commentInput,
            )
            _state.update {
                when (result) {
                    is AppResult.Success -> it.copy(isSending = false, commentInput = "")
                    is AppResult.Failure -> it.copy(
                        isSending = false,
                        error = result.error.toString(),
                    )
                }
            }
        }
    }

    fun uploadPhoto(fileName: String, fileBytes: ByteArray, mimeType: String) {
        val taskId = _state.value.task?.id ?: return
        if (_state.value.isUploading) return

        _state.update { it.copy(isUploading = true, error = null) }
        viewModelScope.launch {
            val result = uploadTaskPhotoUseCase(
                taskId = taskId,
                fileName = fileName,
                fileBytes = fileBytes,
                mimeType = mimeType,
            )
            _state.update {
                when (result) {
                    is AppResult.Success -> it.copy(isUploading = false)
                    is AppResult.Failure -> it.copy(
                        isUploading = false,
                        error = result.error.toString(),
                    )
                }
            }
        }
    }
}
