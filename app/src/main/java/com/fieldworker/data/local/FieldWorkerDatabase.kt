package com.fieldworker.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.fieldworker.data.local.dao.CommentDao
import com.fieldworker.data.local.dao.PendingActionDao
import com.fieldworker.data.local.dao.TaskDao
import com.fieldworker.data.local.entity.CommentEntity
import com.fieldworker.data.local.entity.PendingAction
import com.fieldworker.data.local.entity.TaskEntity

/**
 * Room Database для локального хранения данных.
 * Обеспечивает offline-режим работы приложения.
 */
@Database(
    entities = [
        TaskEntity::class,
        CommentEntity::class,
        PendingAction::class
    ],
    version = 4,
    exportSchema = true
)
abstract class FieldWorkerDatabase : RoomDatabase() {
    
    abstract fun taskDao(): TaskDao
    abstract fun commentDao(): CommentDao
    abstract fun pendingActionDao(): PendingActionDao
    
    companion object {
        const val DATABASE_NAME = "fieldworker_db"
        
        /**
         * Миграция с версии 1 на 2: добавление поля plannedDate в таблицу tasks
         */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE tasks ADD COLUMN plannedDate TEXT DEFAULT NULL")
            }
        }

        /**
         * Migration 2 -> 3: add tempId to pending_actions for offline comment reconciliation.
         */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE pending_actions ADD COLUMN tempId TEXT DEFAULT NULL")
            }
        }

        /**
         * Migration 3 -> 4: add explicit task metadata from updated server API.
         */
        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE tasks ADD COLUMN customerName TEXT DEFAULT NULL")
                db.execSQL("ALTER TABLE tasks ADD COLUMN customerPhone TEXT DEFAULT NULL")
                db.execSQL("ALTER TABLE tasks ADD COLUMN assignedUserId INTEGER DEFAULT NULL")
                db.execSQL("ALTER TABLE tasks ADD COLUMN assignedUserName TEXT DEFAULT NULL")
                db.execSQL("ALTER TABLE tasks ADD COLUMN isRemote INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE tasks ADD COLUMN isPaid INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE tasks ADD COLUMN paymentAmount REAL NOT NULL DEFAULT 0.0")
                db.execSQL("ALTER TABLE tasks ADD COLUMN systemType TEXT DEFAULT NULL")
                db.execSQL("ALTER TABLE tasks ADD COLUMN defectType TEXT DEFAULT NULL")
            }
        }
    }
}
