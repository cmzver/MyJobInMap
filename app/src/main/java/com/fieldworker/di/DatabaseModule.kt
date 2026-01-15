package com.fieldworker.di

import android.content.Context
import android.util.Log
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import com.fieldworker.data.local.FieldWorkerDatabase
import com.fieldworker.data.local.dao.CommentDao
import com.fieldworker.data.local.dao.PendingActionDao
import com.fieldworker.data.local.dao.TaskDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt модуль для Room Database.
 * 
 * Стратегия миграций:
 * - Development: fallbackToDestructiveMigration() для удобства разработки
 * - Production: будут добавлены миграции при изменении схемы
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    
    private const val TAG = "DatabaseModule"
    
    @Provides
    @Singleton
    fun provideDatabase(
        @ApplicationContext context: Context
    ): FieldWorkerDatabase {
        return Room.databaseBuilder(
            context,
            FieldWorkerDatabase::class.java,
            FieldWorkerDatabase.DATABASE_NAME
        )
            // Миграции
            .addMigrations(
                FieldWorkerDatabase.MIGRATION_1_2,
                FieldWorkerDatabase.MIGRATION_2_3
            )
            // Для разработки: при изменении схемы БД будет пересоздана (если нет миграции)
            .fallbackToDestructiveMigration()
            .addCallback(object : RoomDatabase.Callback() {
                override fun onCreate(db: SupportSQLiteDatabase) {
                    super.onCreate(db)
                    Log.d(TAG, "Database created, version ${db.version}")
                }
                
                override fun onOpen(db: SupportSQLiteDatabase) {
                    super.onOpen(db)
                    Log.d(TAG, "Database opened, version ${db.version}")
                }
                
                override fun onDestructiveMigration(db: SupportSQLiteDatabase) {
                    super.onDestructiveMigration(db)
                    Log.w(TAG, "Database destructively migrated to version ${db.version}")
                }
            })
            .build()
    }
    
    @Provides
    @Singleton
    fun provideTaskDao(database: FieldWorkerDatabase): TaskDao {
        return database.taskDao()
    }
    
    @Provides
    @Singleton
    fun provideCommentDao(database: FieldWorkerDatabase): CommentDao {
        return database.commentDao()
    }
    
    @Provides
    @Singleton
    fun providePendingActionDao(database: FieldWorkerDatabase): PendingActionDao {
        return database.pendingActionDao()
    }
    
    // =================================================================================
    // Пример миграции для будущего использования:
    // =================================================================================
    // 
    // val MIGRATION_1_2 = object : Migration(1, 2) {
    //     override fun migrate(database: SupportSQLiteDatabase) {
    //         // Добавление нового столбца
    //         database.execSQL("ALTER TABLE tasks ADD COLUMN phone TEXT")
    //     }
    // }
    //
    // Затем добавить в databaseBuilder:
    // .addMigrations(MIGRATION_1_2, MIGRATION_2_3, ...)
    // =================================================================================
}
