package com.fieldworker.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import javax.inject.Qualifier

/**
 * Квалификатор для IO-диспетчера корутин.
 *
 * Внедрение диспетчера (вместо прямого обращения к [Dispatchers.IO]) делает
 * suspend-логику тестируемой: в unit-тестах подставляется тестовый диспетчер,
 * работающий на виртуальном времени `runTest`, а не на реальном пуле потоков.
 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher

@Module
@InstallIn(SingletonComponent::class)
object DispatchersModule {

    @Provides
    @IoDispatcher
    fun provideIoDispatcher(): CoroutineDispatcher = Dispatchers.IO
}
