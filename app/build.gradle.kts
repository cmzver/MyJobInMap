plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.kotlin.allopen)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.google.services)
}

// all-open: делает @Singleton классы open для MockK subclass-мокинга
allOpen {
    annotation("javax.inject.Singleton")
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

android {
    namespace = "com.fieldworker"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.fieldworker"
        minSdk = 24
        targetSdk = 34
        versionCode = 23700
        versionName = "2.37.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    
    kotlinOptions {
        jvmTarget = "17"
        // Конфиг стабильности Compose (compiler 1.5.5+): List/Set/Map и java.time
        // считаются стабильными — экраны с такими параметрами снова пропускают
        // рекомпозицию, когда данные не менялись.
        freeCompilerArgs += listOf(
            "-P",
            "plugin:androidx.compose.compiler.plugins.kotlin:stabilityConfigurationPath=" +
                "${project.projectDir.absolutePath}/compose-stability.conf",
        )
        // Отчёты о стабильности/пропускаемости composable: ./gradlew :app:compileDebugKotlin -PcomposeReports
        // → app/build/compose_reports/
        if (project.hasProperty("composeReports")) {
            val reportsDir = "${project.layout.buildDirectory.get().asFile.absolutePath}/compose_reports"
            freeCompilerArgs += listOf(
                "-P", "plugin:androidx.compose.compiler.plugins.kotlin:reportsDestination=$reportsDir",
                "-P", "plugin:androidx.compose.compiler.plugins.kotlin:metricsDestination=$reportsDir",
            )
        }
    }
    
    buildFeatures {
        compose = true
        buildConfig = true
    }
    
    composeOptions {
        kotlinCompilerExtensionVersion = libs.versions.composeCompiler.get()
    }
    
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    testOptions {
        // Неинициализированные android.* методы (например, Log) возвращают
        // дефолты вместо "not mocked", чтобы не плодить mockkStatic(Log) в каждом
        // тесте. Важно: mockkStatic(android.util.Log) конфликтует со стабингом
        // property-геттеров (every { mock.prop }) — см. MapViewModelTest.
        unitTests.isReturnDefaultValues = true
        // Robolectric-скриншоты (ui/screenshot) читают ресурсы приложения
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            // Скриншот-тесты медленные (Robolectric) — только по запросу:
            //   ./gradlew :app:testDebugUnitTest -Pscreenshots --tests "*.screenshot.*"
            // PNG пишутся в app/build/outputs/roborazzi/.
            if (project.hasProperty("screenshots")) {
                it.systemProperty("roborazzi.test.record", "true")
            } else {
                it.exclude("**/screenshot/**")
            }
            // MockK agent needs these JVM args on JDK 17+ / 21+
            it.jvmArgs(
                "-XX:+EnableDynamicAgentLoading",
                "--add-opens", "java.base/java.lang=ALL-UNNAMED",
                "--add-opens", "java.base/java.lang.reflect=ALL-UNNAMED",
                "--add-opens", "java.base/java.util=ALL-UNNAMED"
            )
        }
    }
}

dependencies {
    // Core Android
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.splashscreen)
    implementation(libs.androidx.security.crypto)
    coreLibraryDesugaring(libs.desugar.jdk.libs)
    
    // Compose
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    
    // Navigation Compose
    implementation(libs.navigation.compose)
    
    // Paging 3
    implementation(libs.paging.runtime)
    implementation(libs.paging.compose)
    
    // Hilt - Dependency Injection
    implementation(libs.hilt.android)
    ksp(libs.hilt.android.compiler)
    implementation(libs.hilt.navigation.compose)
    
    // Retrofit - Network
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.kotlinx.serialization)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp.logging)
    
    // Coroutines
    implementation(libs.kotlinx.coroutines.android)
    
    // osmdroid - OpenStreetMap
    implementation(libs.osmdroid)
    
    // Coil - Image Loading
    implementation(libs.coil.compose)
    
    // Firebase
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging.ktx)
    
    // WorkManager for background polling (fallback for devices without GMS)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.hilt.work)
    ksp(libs.hilt.compiler)
    
    // Google Play Services (for GMS availability check)
    implementation(libs.play.services.base)
    
    // Room Database for offline support
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    implementation(libs.room.paging)
    ksp(libs.room.compiler)
    
    // Testing
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.mockk)
    testImplementation(libs.mockk.agent)
    testImplementation(libs.turbine)
    testImplementation(libs.arch.core.testing)
    testImplementation(libs.room.testing)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    
    androidTestImplementation(libs.androidx.test.ext)
    androidTestImplementation(libs.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}

// Конфиг стабильности Compose — вход компиляции: правка файла должна
// перекомпилировать код, а не оставаться незамеченной инкрементальной сборкой.
tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    inputs.file(layout.projectDirectory.file("compose-stability.conf"))
        .withPathSensitivity(PathSensitivity.RELATIVE)
}
