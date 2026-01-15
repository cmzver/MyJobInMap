package com.fieldworker.domain.model

/**
 * Domain модель пользователя.
 * Используется в UI и бизнес-логике.
 */
data class User(
    val id: Long,
    val username: String,
    val fullName: String,
    val email: String? = null,
    val phone: String? = null,
    val role: UserRole,
    val isActive: Boolean = true
) {
    /**
     * Возвращает отображаемое имя (fullName или username)
     */
    fun getDisplayName(): String = fullName.ifBlank { username }
    
    /**
     * Проверяет, является ли пользователь администратором
     */
    fun isAdmin(): Boolean = role == UserRole.ADMIN
    
    /**
     * Проверяет, является ли пользователь диспетчером
     */
    fun isDispatcher(): Boolean = role == UserRole.DISPATCHER
    
    /**
     * Проверяет, является ли пользователь работником
     */
    fun isWorker(): Boolean = role == UserRole.WORKER
    
    /**
     * Проверяет, может ли пользователь управлять заявками
     * (создавать, назначать, редактировать все)
     */
    fun canManageTasks(): Boolean = role in listOf(UserRole.ADMIN, UserRole.DISPATCHER)
}

/**
 * Роли пользователей.
 * Соответствуют ролям на сервере.
 */
enum class UserRole(val value: String, val displayName: String) {
    ADMIN("admin", "Администратор"),
    DISPATCHER("dispatcher", "Диспетчер"),
    WORKER("worker", "Работник"),
    UNKNOWN("unknown", "Неизвестно");
    
    companion object {
        /**
         * Получить роль из строкового значения
         */
        fun fromString(value: String): UserRole {
            return entries.find { it.value.equals(value, ignoreCase = true) } ?: UNKNOWN
        }
    }
}
