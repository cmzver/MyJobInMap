package com.fieldworker.ui.update

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.UpdateRepository
import com.fieldworker.ui.components.UpdateState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

/**
 * ViewModel для управления проверкой и загрузкой обновлений.
 * Извлекает логику обновления из MainActivity для testability.
 */
@HiltViewModel
class UpdateViewModel @Inject constructor(
    private val updateRepository: UpdateRepository,
    private val appPreferences: AppPreferences
) : ViewModel() {

    companion object {
        private const val TAG = "UpdateViewModel"
    }

    private val _updateState = MutableStateFlow<UpdateState?>(null)
    val updateState: StateFlow<UpdateState?> = _updateState.asStateFlow()

    private val _downloadedApk = MutableStateFlow<File?>(null)
    val downloadedApk: StateFlow<File?> = _downloadedApk.asStateFlow()

    private var downloadJob: Job? = null

    /**
     * Проверить наличие обновления.
     */
    fun checkForUpdate(versionCode: Int, versionName: String, isManualCheck: Boolean = false) {
        if (_updateState.value is UpdateState.Downloading || _updateState.value is UpdateState.ReadyToInstall) {
            return
        }

        val dismissedVersionCode = appPreferences.getDismissedUpdateVersionCode()
        if (dismissedVersionCode != -1 && versionCode >= dismissedVersionCode) {
            appPreferences.clearDismissedUpdateVersionCode()
        }

        viewModelScope.launch {
            if (isManualCheck) {
                _updateState.value = UpdateState.Checking
            }

            updateRepository.checkForUpdate(versionCode, versionName)
                .onSuccess { check ->
                    if (check.updateAvailable && check.update != null) {
                        val ignoredVersionCode = appPreferences.getDismissedUpdateVersionCode()
                        if (!isManualCheck && ignoredVersionCode >= check.update.versionCode) {
                            Log.d(TAG, "Update ${check.update.versionCode} ignored by user")
                            _updateState.value = null
                            return@onSuccess
                        }

                        Log.d(TAG, "Update available: ${check.update.versionName}")
                        _updateState.value = UpdateState.Available(check.update)
                    } else if (isManualCheck) {
                        _updateState.value = UpdateState.UpToDate(versionName)
                    } else if (_updateState.value is UpdateState.Checking) {
                        _updateState.value = null
                    }
                }
                .onFailure {
                    Log.w(TAG, "Update check failed: ${it.message}")
                    if (isManualCheck) {
                        _updateState.value = UpdateState.Error(
                            it.message ?: "Не удалось проверить обновления"
                        )
                    }
                }
        }
    }

    /**
     * Начать загрузку обновления.
     */
    fun startDownload() {
        downloadJob = viewModelScope.launch {
            _updateState.value = UpdateState.Downloading(0)
            updateRepository.downloadUpdate { progress ->
                _updateState.value = UpdateState.Downloading(progress)
            }.onSuccess { file ->
                _downloadedApk.value = file
                _updateState.value = UpdateState.ReadyToInstall
            }.onFailure { error ->
                _updateState.value = UpdateState.Error(
                    error.message ?: "Ошибка загрузки"
                )
            }
        }
    }

    /**
     * Отменить загрузку.
     */
    fun cancelDownload() {
        downloadJob?.cancel()
        downloadJob = null
        _updateState.value = null
    }

    /**
     * Закрыть диалог обновления.
     */
    fun dismiss() {
        val currentState = _updateState.value
        if (currentState is UpdateState.Available && !currentState.info.isMandatory) {
            appPreferences.setDismissedUpdateVersionCode(currentState.info.versionCode)
        }
        _updateState.value = null
    }
}
