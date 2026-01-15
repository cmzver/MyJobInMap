package com.fieldworker.di

import android.content.Context
import com.fieldworker.data.api.AuthApi
import com.fieldworker.data.api.TasksApi
import com.fieldworker.data.network.AuthInterceptor
import com.fieldworker.data.network.RetryInterceptor
import com.fieldworker.data.preferences.AppPreferences
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

/**
 * Hilt модуль для настройки сети и Retrofit.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    
    private const val TIMEOUT_SECONDS = 30L
    
    @Provides
    @Singleton
    fun provideAppPreferences(@ApplicationContext context: Context): AppPreferences {
        return AppPreferences(context)
    }
    
    @Provides
    @Singleton
    fun provideLoggingInterceptor(): HttpLoggingInterceptor {
        return HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
    }
    
    /**
     * Интерцептор для динамической смены базового URL
     */
    @Provides
    @Singleton
    fun provideDynamicUrlInterceptor(appPreferences: AppPreferences): Interceptor {
        return Interceptor { chain ->
            val originalRequest = chain.request()
            val originalUrl = originalRequest.url
            
            // Получаем актуальный URL из настроек
            val newBaseUrl = appPreferences.getFullServerUrl().let { url ->
                if (url.endsWith("/")) url else "$url/"
            }.toHttpUrlOrNull()
            
            val newUrl = if (newBaseUrl != null) {
                originalUrl.newBuilder()
                    .scheme(newBaseUrl.scheme)
                    .host(newBaseUrl.host)
                    .port(newBaseUrl.port)
                    .build()
            } else {
                originalUrl
            }
            
            // Добавляем токен авторизации, если есть
            val token = appPreferences.getAuthToken()
            val newRequest = originalRequest.newBuilder()
                .url(newUrl)
                .apply {
                    if (token != null && originalRequest.header("Authorization") == null) {
                        addHeader("Authorization", "Bearer $token")
                    }
                }
                .build()
            
            chain.proceed(newRequest)
        }
    }
    
    @Provides
    @Singleton
    fun provideOkHttpClient(
        loggingInterceptor: HttpLoggingInterceptor,
        dynamicUrlInterceptor: Interceptor,
        retryInterceptor: RetryInterceptor,
        authInterceptor: AuthInterceptor
    ): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(retryInterceptor) // Retry first
            .addInterceptor(dynamicUrlInterceptor) // Add token & dynamic URL
            .addInterceptor(authInterceptor) // Handle 401 responses
            .addInterceptor(loggingInterceptor) // Logging last
            .connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .build()
    }
    
    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient): Retrofit {
        // Используем placeholder URL, реальный URL будет подставлен интерцептором
        return Retrofit.Builder()
            .baseUrl("http://localhost/")
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }
    
    @Provides
    @Singleton
    fun provideTasksApi(retrofit: Retrofit): TasksApi {
        return retrofit.create(TasksApi::class.java)
    }
    
    @Provides
    @Singleton
    fun provideAuthApi(retrofit: Retrofit): AuthApi {
        return retrofit.create(AuthApi::class.java)
    }
}
