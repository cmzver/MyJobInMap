package com.fieldworker.data.local

import androidx.room.withTransaction
import javax.inject.Inject
import javax.inject.Singleton

/** Small injectable boundary that keeps local state and its outbox atomic. */
@Singleton
class LocalTransactionRunner @Inject constructor(
    private val database: FieldWorkerDatabase
) {
    suspend fun run(block: suspend () -> Unit) {
        database.withTransaction { block() }
    }
}
