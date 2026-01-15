package com.fieldworker.data.preferences

import android.content.Context
import android.content.SharedPreferences
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.TaskStatus
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Управление настройками приложения через SharedPreferences
 */
@Singleton
class AppPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        PREFS_NAME, Context.MODE_PRIVATE
    )
    
    // StateFlow для реактивного обновления настроек
    private val _serverUrl = MutableStateFlow(getServerUrl())
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()
    
    private val _statusFilter = MutableStateFlow(getStatusFilter())
    val statusFilter: StateFlow<Set<TaskStatus>> = _statusFilter.asStateFlow()
    
    private val _priorityFilter = MutableStateFlow(getPriorityFilter())
    val priorityFilter: StateFlow<Set<Priority>> = _priorityFilter.asStateFlow()
    
    private val _hideDoneTasks = MutableStateFlow(getHideDoneTasks())
    val hideDoneTasks: StateFlow<Boolean> = _hideDoneTasks.asStateFlow()
    
    private val _showMyLocation = MutableStateFlow(getShowMyLocation())
    val showMyLocation: StateFlow<Boolean> = _showMyLocation.asStateFlow()
    
    /**
     * SharedFlow для события принудительного логаута.
     * Используется AuthInterceptor при получении 401 Unauthorized.
     * MainActivity подписывается на этот flow и перенаправляет на экран логина.
     * 
     * extraBufferCapacity = 10: буфер для emit без блокировки, достаточно большой
     */
    private val _logoutEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 10)
    val logoutEvent: SharedFlow<Unit> = _logoutEvent.asSharedFlow()
    
    // Флаг: был ли запрошен принудительный logout (для проверки при запуске)
    @Volatile
    private var _forcedLogoutRequested = false
    val forcedLogoutRequested: Boolean get() = _forcedLogoutRequested
    
    // ==================== Серверные настройки ====================
    
    fun getServerUrl(): String {
        return prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
    }
    
    fun setServerUrl(url: String) {
        prefs.edit().putString(KEY_SERVER_URL, url).apply()
        _serverUrl.value = url
    }
    
    fun getServerPort(): Int {
        return prefs.getInt(KEY_SERVER_PORT, DEFAULT_SERVER_PORT)
    }
    
    fun setServerPort(port: Int) {
        prefs.edit().putInt(KEY_SERVER_PORT, port).apply()
    }
    
    /**
     * Получить полный URL сервера
     */
    fun getFullServerUrl(): String {
        val url = getServerUrl().trimEnd('/')
        val port = getServerPort()
        // Проверяем, есть ли уже порт в URL (после схемы ://)
        val urlWithoutScheme = url.substringAfter("://")
        return if (urlWithoutScheme.contains(":")) {
            url // Порт уже включен
        } else {
            "$url:$port"
        }
    }
    
    // ==================== Фильтры ====================
    
    fun getStatusFilter(): Set<TaskStatus> {
        val saved = prefs.getStringSet(KEY_STATUS_FILTER, null)
        return if (saved.isNullOrEmpty()) {
            // По умолчанию скрываем выполненные задачи
            setOf(TaskStatus.NEW, TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED)
        } else {
            saved.mapNotNull { 
                try { TaskStatus.fromString(it) } catch (e: Exception) { null }
            }.toSet()
        }
    }
    
    fun setStatusFilter(filter: Set<TaskStatus>) {
        val stringSet = filter.map { it.name }.toSet()
        prefs.edit().putStringSet(KEY_STATUS_FILTER, stringSet).apply()
        _statusFilter.value = filter
    }
    
    fun getPriorityFilter(): Set<Priority> {
        val saved = prefs.getStringSet(KEY_PRIORITY_FILTER, null)
        return if (saved.isNullOrEmpty()) {
            emptySet() // По умолчанию показываем все приоритеты
        } else {
            saved.mapNotNull { 
                try { Priority.valueOf(it) } catch (e: Exception) { null }
            }.toSet()
        }
    }
    
    fun setPriorityFilter(filter: Set<Priority>) {
        val stringSet = filter.map { it.name }.toSet()
        prefs.edit().putStringSet(KEY_PRIORITY_FILTER, stringSet).apply()
        _priorityFilter.value = filter
    }
    
    // ==================== Отображение ====================
    
    fun getHideDoneTasks(): Boolean {
        return prefs.getBoolean(KEY_HIDE_DONE_TASKS, true) // По умолчанию скрываем
    }
    
    fun setHideDoneTasks(hide: Boolean) {
        prefs.edit().putBoolean(KEY_HIDE_DONE_TASKS, hide).apply()
        _hideDoneTasks.value = hide
        
        // Обновляем фильтр статусов
        val currentFilter = getStatusFilter().toMutableSet()
        if (hide) {
            currentFilter.remove(TaskStatus.DONE)
        } else {
            currentFilter.add(TaskStatus.DONE)
        }
        setStatusFilter(currentFilter)
    }
    
    fun getShowMyLocation(): Boolean {
        return prefs.getBoolean(KEY_SHOW_MY_LOCATION, true)
    }
    
    fun setShowMyLocation(show: Boolean) {
        prefs.edit().putBoolean(KEY_SHOW_MY_LOCATION, show).apply()
        _showMyLocation.value = show
    }
    
    // ==================== Уведомления ====================
    
    fun getNotificationsEnabled(): Boolean {
        return prefs.getBoolean(KEY_NOTIFICATIONS_ENABLED, true)
    }
    
    fun setNotificationsEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_NOTIFICATIONS_ENABLED, enabled).apply()
    }
    
    fun getNotifyNewTasks(): Boolean {
        return prefs.getBoolean(KEY_NOTIFY_NEW_TASKS, true)
    }
    
    fun setNotifyNewTasks(notify: Boolean) {
        prefs.edit().putBoolean(KEY_NOTIFY_NEW_TASKS, notify).apply()
    }
    
    fun getNotifyStatusChange(): Boolean {
        return prefs.getBoolean(KEY_NOTIFY_STATUS_CHANGE, true)
    }
    
    fun setNotifyStatusChange(notify: Boolean) {
        prefs.edit().putBoolean(KEY_NOTIFY_STATUS_CHANGE, notify).apply()
    }
    
    fun getFcmToken(): String? {
        return prefs.getString(KEY_FCM_TOKEN, null)
    }
    
    fun setFcmToken(token: String) {
        prefs.edit().putString(KEY_FCM_TOKEN, token).apply()
    }
    
    // ==================== Polling (для устройств без GMS) ====================
    
    fun getLastCheckedTaskId(): Int {
        return prefs.getInt(KEY_LAST_CHECKED_TASK_ID, 0)
    }
    
    fun setLastCheckedTaskId(id: Int) {
        prefs.edit().putInt(KEY_LAST_CHECKED_TASK_ID, id).apply()
    }
    
    fun isPollingEnabled(): Boolean {
        return prefs.getBoolean(KEY_POLLING_ENABLED, false)
    }
    
    fun setPollingEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_POLLING_ENABLED, enabled).apply()
    }
    
    fun getPollingIntervalMinutes(): Int {
        return prefs.getInt(KEY_POLLING_INTERVAL, DEFAULT_POLLING_INTERVAL)
    }
    
    fun setPollingIntervalMinutes(minutes: Int) {
        prefs.edit().putInt(KEY_POLLING_INTERVAL, minutes).apply()
    }
    
    // ==================== Сброс настроек ====================
    
    fun resetToDefaults() {
        prefs.edit().clear().apply()
        _serverUrl.value = DEFAULT_SERVER_URL
        _statusFilter.value = setOf(TaskStatus.NEW, TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED)
        _priorityFilter.value = emptySet()
        _hideDoneTasks.value = true
        _showMyLocation.value = true
    }
    
    // ==================== Авторизация ====================
    
    fun getAuthToken(): String? {
        return prefs.getString(KEY_AUTH_TOKEN, null)
    }
    
    fun setAuthToken(token: String?) {
        if (token != null) {
            prefs.edit().putString(KEY_AUTH_TOKEN, token).apply()
        } else {
            prefs.edit().remove(KEY_AUTH_TOKEN).apply()
        }
    }
    
    fun getUserId(): Long {
        return prefs.getLong(KEY_USER_ID, -1)
    }
    
    fun setUserId(id: Long) {
        prefs.edit().putLong(KEY_USER_ID, id).apply()
    }
    
    fun getUsername(): String? {
        return prefs.getString(KEY_USERNAME, null)
    }
    
    fun setUsername(username: String?) {
        if (username != null) {
            prefs.edit().putString(KEY_USERNAME, username).apply()
        } else {
            prefs.edit().remove(KEY_USERNAME).apply()
        }
    }
    
    fun getUserFullName(): String? {
        return prefs.getString(KEY_USER_FULLNAME, null)
    }
    
    fun setUserFullName(name: String?) {
        if (name != null) {
            prefs.edit().putString(KEY_USER_FULLNAME, name).apply()
        } else {
            prefs.edit().remove(KEY_USER_FULLNAME).apply()
        }
    }
    
    fun getUserRole(): String? {
        return prefs.getString(KEY_USER_ROLE, null)
    }
    
    fun setUserRole(role: String?) {
        if (role != null) {
            prefs.edit().putString(KEY_USER_ROLE, role).apply()
        } else {
            prefs.edit().remove(KEY_USER_ROLE).apply()
        }
    }
    
    fun isLoggedIn(): Boolean {
        return getAuthToken() != null
    }
    
    fun logout() {
        prefs.edit()
            .remove(KEY_AUTH_TOKEN)
            .remove(KEY_USER_ID)
            .remove(KEY_USERNAME)
            .remove(KEY_USER_FULLNAME)
            .remove(KEY_USER_ROLE)
            .apply()
    }
    
    /**
     * Вызывает принудительный логаут и отправляет событие для UI.
     * Используется AuthInterceptor при получении 401 Unauthorized.
     */
    fun triggerLogout() {
        android.util.Log.w("AppPreferences", "triggerLogout() called - clearing auth and emitting event")
        _forcedLogoutRequested = true
        logout()
        val emitted = _logoutEvent.tryEmit(Unit)
        android.util.Log.w("AppPreferences", "triggerLogout() - event emitted: $emitted")
    }
    
    /**
     * Сбросить флаг принудительного logout после обработки
     */
    fun clearForcedLogoutFlag() {
        _forcedLogoutRequested = false
    }

    companion object {
        private const val PREFS_NAME = "fieldworker_prefs"
        
        // Ключи
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_SERVER_PORT = "server_port"
        private const val KEY_STATUS_FILTER = "status_filter"
        private const val KEY_PRIORITY_FILTER = "priority_filter"
        private const val KEY_HIDE_DONE_TASKS = "hide_done_tasks"
        private const val KEY_SHOW_MY_LOCATION = "show_my_location"
        private const val KEY_NOTIFICATIONS_ENABLED = "notifications_enabled"
        private const val KEY_NOTIFY_NEW_TASKS = "notify_new_tasks"
        private const val KEY_NOTIFY_STATUS_CHANGE = "notify_status_change"
        private const val KEY_FCM_TOKEN = "fcm_token"
        private const val KEY_LAST_CHECKED_TASK_ID = "last_checked_task_id"
        private const val KEY_POLLING_ENABLED = "polling_enabled"
        private const val KEY_POLLING_INTERVAL = "polling_interval_minutes"
        
        // Авторизация
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USERNAME = "username"
        private const val KEY_USER_FULLNAME = "user_fullname"
        private const val KEY_USER_ROLE = "user_role"
        
        // Значения по умолчанию
        const val DEFAULT_SERVER_URL = "http://10.0.2.2"
        const val DEFAULT_SERVER_PORT = 8001
        const val DEFAULT_POLLING_INTERVAL = 15 // минуты
        
        // Доступные интервалы polling (в минутах)
        val POLLING_INTERVALS = listOf(5, 10, 15, 30, 60)
    }
}
