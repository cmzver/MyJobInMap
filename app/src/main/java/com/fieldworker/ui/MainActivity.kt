package com.fieldworker.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.lifecycleScope
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.AuthRepository
import com.fieldworker.data.repository.OfflineFirstTasksRepository
import com.fieldworker.ui.auth.LoginScreen
import com.fieldworker.ui.components.UpdateDialog
import com.fieldworker.ui.main.MainScreen
import com.fieldworker.ui.theme.FieldWorkerTheme
import com.fieldworker.ui.update.UpdateViewModel
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

/**
 * Главная Activity приложения.
 * Использует Hilt для DI и Jetpack Compose для UI.
 * Поддерживает Splash Screen API для плавного запуска.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    
    companion object {
        private const val TAG = "MainActivity"
        const val EXTRA_TASK_ID = "task_id"
    }
    
    @Inject
    lateinit var appPreferences: AppPreferences
    
    @Inject
    lateinit var tasksRepository: OfflineFirstTasksRepository
    
    @Inject
    lateinit var authRepository: AuthRepository
    
    private val updateViewModel: UpdateViewModel by viewModels()
    
    // Флаг готовности приложения (используется для Splash Screen)
    private var isAppReady = false
    private var pendingNotificationTaskId by mutableStateOf<Long?>(null)
    
    // Запрос разрешения на уведомления для Android 13+
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            Log.d(TAG, "Notification permission granted")
        } else {
            Log.w(TAG, "Notification permission denied")
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        // Устанавливаем Splash Screen ПЕРЕД super.onCreate()
        val splashScreen = installSplashScreen()
        
        super.onCreate(savedInstanceState)
        pendingNotificationTaskId = extractTaskIdFromIntent(intent)
        
        // Контролируем, когда скрыть Splash Screen
        splashScreen.setKeepOnScreenCondition { !isAppReady }
        
        // Запрашиваем разрешение на уведомления для Android 13+
        askNotificationPermission()
        
        // Приложение готово к работе
        isAppReady = true
        
        setContent {
            FieldWorkerTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    // Состояния авторизации
                    var authState by remember { mutableStateOf<AuthState>(AuthState.Loading) }
                    
                    // Проверяем сессию при запуске
                    LaunchedEffect(Unit) {
                        Log.d(TAG, "========== SESSION VALIDATION START ==========")
                        
                        // Проверяем флаг принудительного logout
                        if (appPreferences.forcedLogoutRequested) {
                            Log.w(TAG, "Forced logout flag detected, clearing")
                            appPreferences.clearForcedLogoutFlag()
                            tasksRepository.clearCache()
                            authState = AuthState.NotLoggedIn
                            return@LaunchedEffect
                        }
                        
                        // Проверяем наличие токена
                        val token = appPreferences.getAuthToken()
                        Log.d(TAG, "Token present: ${token != null}, token prefix: ${token?.take(30)}...")
                        Log.d(TAG, "Server URL: ${appPreferences.getFullServerUrl()}")
                        Log.d(TAG, "Username in prefs: ${appPreferences.getUsername()}")
                        
                        if (token == null) {
                            Log.d(TAG, "No token found, showing login")
                            authState = AuthState.NotLoggedIn
                            return@LaunchedEffect
                        }
                        
                        // Есть токен - проверяем сессию на сервере
                        Log.d(TAG, "Token found, validating session on server...")
                        val validationResult = authRepository.validateCurrentUser()
                        Log.d(TAG, "Validation result: $validationResult")
                        
                        when (validationResult) {
                            AuthRepository.ValidationResult.VALID -> {
                                Log.d(TAG, "Session VALID, showing main screen")
                                authState = AuthState.LoggedIn
                            }
                            AuthRepository.ValidationResult.INVALID -> {
                                Log.w(TAG, "Session INVALID (user deleted?), clearing and logout")
                                tasksRepository.clearCache()
                                appPreferences.logout()
                                authState = AuthState.NotLoggedIn
                            }
                            AuthRepository.ValidationResult.UNKNOWN -> {
                                // Ошибка сети - разрешаем работать с кешем
                                Log.w(TAG, "Validation UNKNOWN (network error), allowing cached mode")
                                authState = AuthState.LoggedIn
                            }
                        }
                        Log.d(TAG, "========== SESSION VALIDATION END ==========")
                    }
                    
                    // Подписываемся на событие принудительного логаута (401 Unauthorized)
                    LaunchedEffect(Unit) {
                        appPreferences.logoutEvent.collectLatest {
                            Log.w(TAG, "Received logout event (401 Unauthorized), clearing cache")
                            appPreferences.clearForcedLogoutFlag()
                            tasksRepository.clearCache()
                            authState = AuthState.NotLoggedIn
                        }
                    }
                    
                    // Отображаем UI в зависимости от состояния
                    when (authState) {
                        AuthState.Loading -> {
                            // Показываем загрузку пока проверяем сессию
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator(
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                        AuthState.LoggedIn -> {
                            // === Проверка обновлений ===
                            val updateState by updateViewModel.updateState.collectAsState()
                            val downloadedApk by updateViewModel.downloadedApk.collectAsState()
                            val lifecycleOwner = LocalLifecycleOwner.current
                            val appVersionInfo = rememberAppVersionInfo()

                            LaunchedEffect(appVersionInfo.versionCode, appVersionInfo.versionName) {
                                updateViewModel.checkForUpdate(
                                    versionCode = appVersionInfo.versionCode,
                                    versionName = appVersionInfo.versionName,
                                    isManualCheck = false
                                )
                            }

                            DisposableEffect(lifecycleOwner, appVersionInfo.versionCode, appVersionInfo.versionName) {
                                val observer = LifecycleEventObserver { _, event ->
                                    if (event == Lifecycle.Event.ON_RESUME) {
                                        updateViewModel.checkForUpdate(
                                            versionCode = appVersionInfo.versionCode,
                                            versionName = appVersionInfo.versionName,
                                            isManualCheck = false
                                        )
                                    }
                                }

                                lifecycleOwner.lifecycle.addObserver(observer)
                                onDispose {
                                    lifecycleOwner.lifecycle.removeObserver(observer)
                                }
                            }
                            
                            MainScreen(
                                notificationTaskId = pendingNotificationTaskId,
                                onNotificationTaskHandled = {
                                    pendingNotificationTaskId = null
                                    intent?.removeExtra(EXTRA_TASK_ID)
                                },
                                onCheckForUpdates = {
                                    updateViewModel.checkForUpdate(
                                        versionCode = appVersionInfo.versionCode,
                                        versionName = appVersionInfo.versionName,
                                        isManualCheck = true
                                    )
                                },
                                isCheckingForUpdates = updateState is com.fieldworker.ui.components.UpdateState.Checking,
                                onLogout = {
                                    lifecycleScope.launch {
                                        tasksRepository.clearCache()
                                        Log.d(TAG, "Task cache cleared on logout")
                                    }
                                    appPreferences.logout()
                                    // Перезапускаем Activity для полного сброса состояния
                                    val intent = Intent(this@MainActivity, MainActivity::class.java)
                                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                                    startActivity(intent)
                                    finish()
                                }
                            )
                            
                            // Диалог обновления
                            if (updateState != null) {
                                UpdateDialog(
                                    state = updateState!!,
                                    onDismiss = { updateViewModel.dismiss() },
                                    onDownload = { updateViewModel.startDownload() },
                                    onInstall = {
                                        downloadedApk?.let { apk ->
                                            installApk(apk)
                                        }
                                    },
                                    onCancelDownload = { updateViewModel.cancelDownload() }
                                )
                            }
                        }
                        AuthState.NotLoggedIn -> {
                            LoginScreen(
                                onLoginSuccess = {
                                    authState = AuthState.LoggedIn
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingNotificationTaskId = extractTaskIdFromIntent(intent)
    }
    
    /**
     * Состояние авторизации
     */
    private sealed class AuthState {
        data object Loading : AuthState()
        data object LoggedIn : AuthState()
        data object NotLoggedIn : AuthState()
    }
    
    private fun askNotificationPermission() {
        // Для Android 13+ (API 33+) нужно запрашивать разрешение
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
            ) {
                Log.d(TAG, "Notification permission already granted")
            } else {
                Log.d(TAG, "Requesting notification permission")
                requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        } else {
            Log.d(TAG, "Notification permission not required (API < 33)")
        }
    }
    
    /**
     * Запуск установки APK через FileProvider
     */
    private fun installApk(apkFile: File) {
        try {
            val uri = FileProvider.getUriForFile(
                this,
                "${packageName}.fileprovider",
                apkFile
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to install APK", e)
        }
    }

    private fun extractTaskIdFromIntent(intent: Intent?): Long? {
        val rawTaskId = intent?.getStringExtra(EXTRA_TASK_ID) ?: return null
        return rawTaskId.toLongOrNull()
    }

    @androidx.compose.runtime.Composable
    private fun rememberAppVersionInfo(): AppVersionInfo {
        return remember(packageName) {
            val packageInfo = try {
                packageManager.getPackageInfo(packageName, 0)
            } catch (e: Exception) {
                null
            }

            val versionCode = if (packageInfo != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    packageInfo.longVersionCode.toInt()
                } else {
                    @Suppress("DEPRECATION")
                    packageInfo.versionCode
                }
            } else {
                1
            }

            AppVersionInfo(
                versionCode = versionCode,
                versionName = packageInfo?.versionName ?: "1.0"
            )
        }
    }

    private data class AppVersionInfo(
        val versionCode: Int,
        val versionName: String
    )
}
