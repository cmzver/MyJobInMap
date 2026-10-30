package com.fieldworker.ui.update

import android.os.SystemClock
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.data.network.NetworkMonitor
import com.fieldworker.data.network.ServerHealthCheck
import com.fieldworker.data.network.toUserMessage
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.UpdateRepository
import com.fieldworker.ui.components.UpdateState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.io.IOException
import java.net.SocketTimeoutException
import javax.inject.Inject

/**
 * ViewModel для управления проверкой и загрузкой обновлений.
 * Извлекает логику обновления из MainActivity для testability.
 */
@HiltViewModel
class UpdateViewModel @Inject constructor(
    private val updateRepository: UpdateRepository,
    private val appPreferences: AppPreferences,
    private val networkMonitor: NetworkMonitor,
    private val serverHealthCheck: ServerHealthCheck
) : ViewModel() {

    companion object {
        private const val TAG = "UpdateViewModel"

        /** Автопроверка дёргается на каждый ON_RESUME (фото-пикер, звонок…) — не чаще. */
        private const val AUTO_CHECK_INTERVAL_MS = 30 * 60_000L

        /**
         * Ручная проверка: дольше спиннер не крутим. Без этого таймауты
         * подключения, чтения и повтор RetryInterceptor растягивали её на минуту.
         */
        internal const val MANUAL_CHECK_TIMEOUT_MS = 8_000L

        internal const val NO_CONNECTION_MESSAGE =
            "Нет связи с сервером. Проверьте подключение и попробуйте ещё раз."
    }

    private val _updateState = MutableStateFlow<UpdateState?>(null)
    val updateState: StateFlow<UpdateState?> = _updateState.asStateFlow()

    private val _downloadedApk = MutableStateFlow<File?>(null)
    val downloadedApk: StateFlow<File?> = _downloadedApk.asStateFlow()

    private var downloadJob: Job? = null
    private var checkJob: Job? = null
    private var lastAutoCheckAtMs = 0L

    /**
     * Проверить наличие обновления.
     */
    fun checkForUpdate(versionCode: Int, versionName: String, isManualCheck: Boolean = false) {
        if (_updateState.value is UpdateState.Downloading || _updateState.value is UpdateState.ReadyToInstall) {
            return
        }

        // Без сети или при заведомо недоступном сервере не ждём таймауты запроса;
        // автопроверка при этом не считается сделанной — повторится со связью
        if (!networkMonitor.isCurrentlyOnline() || serverHealthCheck.lastKnownReachable == false) {
            if (isManualCheck) _updateState.value = UpdateState.Error(NO_CONNECTION_MESSAGE)
            return
        }

        if (!isManualCheck) {
            val now = SystemClock.elapsedRealtime()
            val checkedRecently = lastAutoCheckAtMs != 0L && now - lastAutoCheckAtMs < AUTO_CHECK_INTERVAL_MS
            if (checkJob?.isActive == true || checkedRecently) return
            lastAutoCheckAtMs = now
        }

        val dismissedVersionCode = appPreferences.getDismissedUpdateVersionCode()
        if (dismissedVersionCode != -1 && versionCode >= dismissedVersionCode) {
            appPreferences.clearDismissedUpdateVersionCode()
        }

        checkJob = viewModelScope.launch {
            if (isManualCheck) {
                _updateState.value = UpdateState.Checking
            }

            val result = if (isManualCheck) {
                withTimeoutOrNull(MANUAL_CHECK_TIMEOUT_MS) {
                    updateRepository.checkForUpdate(versionCode, versionName)
                } ?: Result.failure(SocketTimeoutException("Update check timed out"))
            } else {
                updateRepository.checkForUpdate(versionCode, versionName)
            }
            result
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
                            if (it is IOException) NO_CONNECTION_MESSAGE else it.toUserMessage()
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
        if (currentState is UpdateState.Available && currentState.info.isMandatory != true) {
            appPreferences.setDismissedUpdateVersionCode(currentState.info.versionCode.toInt())
        }
        _updateState.value = null
    }
}
