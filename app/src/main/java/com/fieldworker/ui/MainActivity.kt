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
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.repository.AuthRepository
import com.fieldworker.data.repository.OfflineFirstTasksRepository
import com.fieldworker.ui.auth.LoginScreen
import com.fieldworker.ui.main.MainScreen
import com.fieldworker.ui.theme.FieldWorkerTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
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
    }
    
    @Inject
    lateinit var appPreferences: AppPreferences
    
    @Inject
    lateinit var tasksRepository: OfflineFirstTasksRepository
    
    @Inject
    lateinit var authRepository: AuthRepository
    
    // Флаг готовности приложения (используется для Splash Screen)
    private var isAppReady = false
    
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
                            MainScreen(
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
    
    /**
     * Состояние авторизации
     */
    private sealed class AuthState {
        object Loading : AuthState()
        object LoggedIn : AuthState()
        object NotLoggedIn : AuthState()
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
}
