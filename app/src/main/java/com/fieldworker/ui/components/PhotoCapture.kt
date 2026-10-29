package com.fieldworker.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import java.io.File

private const val CAMERA_DIR = "camera"

/**
 * Съёмка системной камерой прямо из карточки заявки. Возвращает запуск
 * камеры; [onPhotoTaken] получает Uri снимка — дальше тот же путь, что
 * у фото из галереи. Разрешение CAMERA не нужно: снимает приложение камеры.
 */
@Composable
fun rememberTakePhotoLauncher(onPhotoTaken: (Uri) -> Unit): () -> Unit {
    val context = LocalContext.current
    // Переживает пересоздание активити, пока открыта камера
    var pendingUri by rememberSaveable { mutableStateOf<String?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val uri = pendingUri?.let(Uri::parse)
        pendingUri = null
        if (saved && uri != null) onPhotoTaken(uri)
    }
    return remember(launcher, context) {
        {
            val uri = createCameraPhotoUri(context)
            pendingUri = uri.toString()
            try {
                launcher.launch(uri)
            } catch (e: ActivityNotFoundException) {
                pendingUri = null
                Toast.makeText(context, "Не найдено приложение камеры", Toast.LENGTH_SHORT).show()
            }
        }
    }
}

private fun createCameraPhotoUri(context: Context): Uri {
    // Не cacheDir: при нехватке места система чистит кеш, пока открыта камера,
    // и снимку некуда записаться
    val dir = File(context.filesDir, CAMERA_DIR).apply { mkdirs() }
    // Прошлые снимки уже скопированы в очередь отправки — оригиналы не копим
    dir.listFiles()?.forEach { it.delete() }
    val file = File(dir, "photo_${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}
