package com.fieldworker.di

import android.content.Context
import android.util.Log
import com.fieldworker.BuildConfig
import com.fieldworker.data.api.AddressesApi
import com.fieldworker.data.api.AuthApi
import com.fieldworker.data.api.TasksApi
import com.fieldworker.data.network.AuthInterceptor
import com.fieldworker.data.network.RetryInterceptor
import com.fieldworker.data.network.TokenAuthenticator
import com.fieldworker.data.preferences.AppPreferences
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.CertificatePinner
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
    
    private const val TAG = "NetworkModule"
    private const val TIMEOUT_SECONDS = 30L
    
    /**
     * Certificate pinning для production серверов.
     * 
     * Для добавления пинов вашего сервера:
     * 1. Получите SHA-256 pin сертификата:
     *    openssl s_client -connect your-server.com:443 | openssl x509 -pubkey -noout | \
     *    openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64
     * 2. Добавьте полученный pin ниже
     * 
     * В dev-сборке certificate pinning отключён (localhost/10.0.2.2).
     */
    private val PINNED_DOMAINS: Map<String, List<String>> = mapOf(
        // Пример для production:
        // "your-server.com" to listOf(
        //     "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",  // Primary
        //     "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="   // Backup
        // )
    )
    
    @Provides
    @Singleton
    fun provideAppPreferences(@ApplicationContext context: Context): AppPreferences {
        return AppPreferences(context)
    }
    
    @Provides
    @Singleton
    fun provideLoggingInterceptor(): HttpLoggingInterceptor {
        return HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
    }
    
    /**
     * Создать CertificatePinner для production серверов.
     * Пустой если PINNED_DOMAINS не настроены (dev-режим).
     */
    @Provides
    @Singleton
    fun provideCertificatePinner(): CertificatePinner {
        val builder = CertificatePinner.Builder()
        
        PINNED_DOMAINS.forEach { (domain, pins) ->
            pins.forEach { pin ->
                builder.add(domain, pin)
                Log.d(TAG, "Certificate pin added for $domain")
            }
        }
        
        return builder.build()
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
        authInterceptor: AuthInterceptor,
        tokenAuthenticator: TokenAuthenticator,
        certificatePinner: CertificatePinner
    ): OkHttpClient {
        return OkHttpClient.Builder()
            .certificatePinner(certificatePinner)
            .authenticator(tokenAuthenticator) // Auto-refresh tokens on 401
            .addInterceptor(retryInterceptor) // Retry first
            .addInterceptor(dynamicUrlInterceptor) // Add token & dynamic URL
            .addInterceptor(authInterceptor) // Handle 401 after refresh failure
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

    @Provides
    @Singleton
    fun provideAddressesApi(retrofit: Retrofit): AddressesApi {
        return retrofit.create(AddressesApi::class.java)
    }
}
