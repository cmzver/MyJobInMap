# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.kts.

# Keep Retrofit
-keepattributes Signature
-keepattributes Exceptions

# Keep Gson
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.fieldworker.data.dto.** { *; }

# Keep osmdroid
-keep class org.osmdroid.** { *; }
