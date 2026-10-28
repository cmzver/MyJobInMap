package com.fieldworker.domain.model

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit тесты для AccessLevel: base_access с сервера в приоритете над slug роли.
 */
class AccessLevelTest {

    @Test
    fun `base_access wins over custom group slug`() {
        assertEquals(AccessLevel.DISPATCHER, AccessLevel.resolve("senior-masters", "dispatcher"))
        assertEquals(AccessLevel.WORKER, AccessLevel.resolve("installers", "worker"))
    }

    @Test
    fun `falls back to builtin role when base_access missing`() {
        assertEquals(AccessLevel.ADMIN, AccessLevel.resolve("superadmin", null))
        assertEquals(AccessLevel.ADMIN, AccessLevel.resolve("admin", ""))
        assertEquals(AccessLevel.DISPATCHER, AccessLevel.resolve("manager", null))
        assertEquals(AccessLevel.DISPATCHER, AccessLevel.resolve("Dispatcher", "bogus"))
    }

    @Test
    fun `unknown role without base_access gets least privilege`() {
        assertEquals(AccessLevel.WORKER, AccessLevel.resolve("senior-masters", null))
        assertEquals(AccessLevel.WORKER, AccessLevel.resolve(null, null))
    }

    @Test
    fun `user helpers follow access level, not role slug`() {
        val user = User(
            id = 1,
            username = "u",
            fullName = "",
            role = "senior-masters",
            roleLabel = "Старшие мастера",
            access = AccessLevel.DISPATCHER,
        )
        assertTrue(user.isDispatcher())
        assertTrue(user.canManageTasks())
        assertFalse(user.isWorker())
        assertEquals("Старшие мастера", user.getRoleDisplayName())
    }

    @Test
    fun `role display name falls back to builtin label then access level`() {
        assertEquals("Менеджер", User(1, "u", "", role = "manager").getRoleDisplayName())
        assertEquals(
            "Диспетчер",
            User(1, "u", "", role = "custom", access = AccessLevel.DISPATCHER).getRoleDisplayName(),
        )
    }
}
