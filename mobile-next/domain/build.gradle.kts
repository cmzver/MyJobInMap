plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.multiplatform")
}

val isMacHost = System.getProperty("os.name").contains("Mac", ignoreCase = true)

kotlin {
    jvmToolchain(21)

    androidTarget()
    if (isMacHost) {
        iosX64()
        iosArm64()
        iosSimulatorArm64()
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.coroutines.core)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}

android {
    namespace = "com.fieldworker.next.domain"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        minSdk = libs.versions.android.minSdk.get().toInt()
    }
}
