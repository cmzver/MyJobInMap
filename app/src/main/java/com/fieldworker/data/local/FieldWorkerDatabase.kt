package com.fieldworker.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.fieldworker.data.local.dao.CommentDao
import com.fieldworker.data.local.dao.ConversationDao
import com.fieldworker.data.local.dao.MessageDao
import com.fieldworker.data.local.dao.PendingActionDao
import com.fieldworker.data.local.dao.TaskDao
import com.fieldworker.data.local.entity.CommentEntity
import com.fieldworker.data.local.entity.ConversationEntity
import com.fieldworker.data.local.entity.MessageEntity
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
        PendingAction::class,
        ConversationEntity::class,
        MessageEntity::class,
    ],
    version = 5,
    exportSchema = true
)
abstract class FieldWorkerDatabase : RoomDatabase() {

    abstract fun taskDao(): TaskDao
    abstract fun commentDao(): CommentDao
    abstract fun pendingActionDao(): PendingActionDao
    abstract fun conversationDao(): ConversationDao
    abstract fun messageDao(): MessageDao
    
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

        /**
         * Migration 4 -> 5: добавляем таблицы кэша чатов (chat_conversations,
         * chat_messages) для оффлайн-показа списка бесед и истории сообщений.
         */
        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `chat_conversations` (
                      `id` INTEGER NOT NULL PRIMARY KEY,
                      `type` TEXT NOT NULL,
                      `name` TEXT,
                      `displayName` TEXT,
                      `avatarUrl` TEXT,
                      `taskId` INTEGER,
                      `unreadCount` INTEGER NOT NULL,
                      `isMuted` INTEGER NOT NULL,
                      `isArchived` INTEGER NOT NULL,
                      `last_message_id` INTEGER,
                      `last_message_text` TEXT,
                      `last_message_sender_name` TEXT,
                      `last_message_created_at` TEXT,
                      `created_at` TEXT NOT NULL,
                      `updated_at` TEXT,
                      `cached_at` INTEGER NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `chat_messages` (
                      `id` INTEGER NOT NULL PRIMARY KEY,
                      `conversation_id` INTEGER NOT NULL,
                      `sender_id` INTEGER NOT NULL,
                      `sender_name` TEXT,
                      `text` TEXT,
                      `message_type` TEXT NOT NULL,
                      `is_edited` INTEGER NOT NULL,
                      `is_deleted` INTEGER NOT NULL,
                      `reply_to_id` INTEGER,
                      `reply_to_text` TEXT,
                      `reply_to_sender_name` TEXT,
                      `attachments_json` TEXT NOT NULL,
                      `reactions_json` TEXT NOT NULL,
                      `created_at` TEXT NOT NULL,
                      `edited_at` TEXT
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS `index_chat_messages_conversation_id_created_at` " +
                            "ON `chat_messages` (`conversation_id`, `created_at`)"
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS `index_chat_messages_conversation_id_id` " +
                            "ON `chat_messages` (`conversation_id`, `id`)"
                )
            }
        }
    }
}
