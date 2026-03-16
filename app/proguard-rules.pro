# FieldWorker ProGuard Rules
# =========================

# ==================== Retrofit ====================
-keepattributes Signature
-keepattributes Exceptions
-keepattributes *Annotation*
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Retrofit interfaces
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}
-keep,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }

# ==================== Gson ====================
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }
-keep class * extends com.google.gson.TypeAdapter
-keep class * extends com.google.gson.TypeAdapterFactory
-keep class * extends com.google.gson.JsonSerializer
-keep class * extends com.google.gson.JsonDeserializer

# Preserve @SerializedName fields
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Keep DTOs (used by Gson reflection)
-keep class com.fieldworker.data.dto.** { *; }

# Keep domain models (may be serialized)
-keep class com.fieldworker.domain.model.** { *; }

# ==================== OkHttp ====================
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# ==================== Coroutines ====================
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}

# ==================== Hilt / Dagger ====================
-dontwarn dagger.hilt.**
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }
-keep,allowobfuscation,allowshrinking class * extends dagger.internal.Factory
-keep,allowobfuscation,allowshrinking class * extends dagger.hilt.android.internal.lifecycle.HiltViewModelFactory

# Keep @AndroidEntryPoint classes
-keep @dagger.hilt.android.AndroidEntryPoint class * { *; }
-keep @dagger.hilt.android.HiltAndroidApp class * { *; }

# ==================== Room ====================
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao class * { *; }
-dontwarn androidx.room.paging.**

# ==================== Firebase ====================
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Keep FirebaseMessagingService
-keep class com.fieldworker.data.notification.FCMService { *; }

# ==================== osmdroid ====================
-keep class org.osmdroid.** { *; }
-dontwarn org.osmdroid.**

# ==================== Coil ====================
-dontwarn coil.**
-keep class coil.** { *; }

# ==================== WorkManager ====================
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.ListenableWorker { *; }
-keep class com.fieldworker.data.sync.SyncWorker { *; }
-keep class com.fieldworker.data.notification.TaskPollingWorker { *; }

# ==================== Compose ====================
# Keep Compose stability annotations
-keep class androidx.compose.runtime.** { *; }
-dontwarn androidx.compose.**

# ==================== Security Crypto ====================
-keep class androidx.security.crypto.** { *; }
-dontwarn com.google.crypto.tink.**

# ==================== Kotlin ====================
-keep class kotlin.Metadata { *; }
-keepclassmembers class kotlin.Metadata {
    public <methods>;
}
-dontwarn kotlin.**
-keepclassmembers class **$WhenMappings {
    <fields>;
}
-keep class kotlin.reflect.jvm.internal.** { *; }

# Keep sealed classes (used for UI state and errors)
-keep class com.fieldworker.data.network.NetworkError { *; }
-keep class com.fieldworker.data.network.NetworkError$* { *; }
-keep class com.fieldworker.ui.map.MapUiState { *; }
-keep class com.fieldworker.ui.components.UpdateState { *; }
-keep class com.fieldworker.ui.components.UpdateState$* { *; }

# ==================== Enums ====================
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ==================== General ====================
# Keep R classes
-keepclassmembers class **.R$* {
    public static <fields>;
}

# Don't warn about missing annotations
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.**
