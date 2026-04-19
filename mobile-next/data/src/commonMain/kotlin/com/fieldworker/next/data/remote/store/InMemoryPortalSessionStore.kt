package com.fieldworker.next.data.remote.store

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class InMemoryPortalSessionStore : PortalSessionStore {
    private val mutex = Mutex()
    private var stored: StoredPortalSession? = null

    override suspend fun read(): StoredPortalSession? = mutex.withLock { stored }

    override suspend fun write(session: StoredPortalSession) = mutex.withLock {
        stored = session
    }

    override suspend fun clear() = mutex.withLock {
        stored = null
    }
}
