package com.fieldworker.domain.model

/**
 * Domain модель пользователя.
 * Используется в UI и бизнес-логике.
 *
 * [role] — сырой slug группы с сервера: встроенная роль (admin/dispatcher/worker,
 * алиасы superadmin/manager) или кастомная группа организации. Для решений о доступе
 * используйте [access], а не [role].
 */
data class User(
    val id: Long,
    val username: String,
    val fullName: String,
    val email: String? = null,
    val phone: String? = null,
    val role: String,
    val roleLabel: String? = null,
    val access: AccessLevel = AccessLevel.resolve(role, null),
    val isActive: Boolean = true,
    val avatarUrl: String? = null
) {
    /**
     * Возвращает отображаемое имя (fullName или username)
     */
    fun getDisplayName(): String = fullName.ifBlank { username }

    /**
     * Название роли для UI: серверный role_label (поддерживает кастомные группы),
     * иначе — название базового уровня доступа.
     */
    fun getRoleDisplayName(): String = roleLabel?.takeIf { it.isNotBlank() }
        ?: AccessLevel.builtinLabel(role)
        ?: access.displayName

    fun isAdmin(): Boolean = access == AccessLevel.ADMIN

    fun isDispatcher(): Boolean = access == AccessLevel.DISPATCHER

    fun isWorker(): Boolean = access == AccessLevel.WORKER

    /**
     * Может ли пользователь управлять заявками (создавать, назначать, редактировать все)
     */
    fun canManageTasks(): Boolean = access.canManageTasks
}

/**
 * Базовый уровень доступа (`base_access` с сервера).
 *
 * Именно он драйвит навигацию и права: кастомная группа наследует один из этих
 * уровней. Уровень ADMIN сервер выдаёт только встроенной роли admin.
 */
enum class AccessLevel(val value: String, val displayName: String) {
    ADMIN("admin", "Администратор"),
    DISPATCHER("dispatcher", "Диспетчер"),
    WORKER("worker", "Работник");

    val canManageTasks: Boolean get() = this != WORKER

    companion object {
        private val BUILTIN_ROLE_LABELS = mapOf(
            "superadmin" to "Супер-админ",
            "admin" to "Администратор",
            "manager" to "Менеджер",
            "dispatcher" to "Диспетчер",
            "worker" to "Работник",
        )

        /**
         * Уровень доступа: серверный base_access в приоритете, иначе — по встроенной
         * роли (для старых сессий без base_access). Неизвестное → WORKER (минимум прав).
         * Повторяет `normalizeRoleForAccess` из портала.
         */
        fun resolve(role: String?, baseAccess: String?): AccessLevel {
            entries.find { it.value == baseAccess?.lowercase() }?.let { return it }
            return when (role?.lowercase()) {
                "superadmin", "admin" -> ADMIN
                "manager", "dispatcher" -> DISPATCHER
                else -> WORKER
            }
        }

        /** Название встроенной роли или null для кастомной группы. */
        fun builtinLabel(role: String?): String? = BUILTIN_ROLE_LABELS[role?.lowercase()]
    }
}
