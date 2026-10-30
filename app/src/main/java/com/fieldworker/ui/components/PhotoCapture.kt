package com.fieldworker.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import com.fieldworker.data.image.PendingPhotoStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Фото, выбранное для заявки, до подтверждения отправки. Заявка запоминается
 * в момент съёмки: камера тяжёлая, система может убить процесс, и после
 * возврата выбранной заявки во ViewModel уже нет — снимок не должен уйти
 * в ту, что откроют следующей.
 */
data class PhotoDraft(val taskId: Long, val uri: Uri)

private val PhotoDraftSaver = Saver<PhotoDraft?, String>(
    save = { draft -> draft?.let { "${it.taskId}|${it.uri}" } },
    restore = { saved ->
        saved.substringBefore('|').toLongOrNull()
            ?.let { taskId -> PhotoDraft(taskId, Uri.parse(saved.substringAfter('|'))) }
    }
)

/** Черновик фото, переживающий пересоздание активити и смерть процесса. */
@Composable
fun rememberPhotoDraft(): MutableState<PhotoDraft?> =
    rememberSaveable(stateSaver = PhotoDraftSaver) { mutableStateOf(null) }

/**
 * Съёмка системной камерой прямо из карточки заявки. Возвращает запуск
 * камеры для заявки; [onPhotoTaken] получает черновик — дальше тот же путь,
 * что у фото из галереи. Разрешение CAMERA не нужно: снимает приложение камеры.
 */
@Composable
fun rememberTakePhotoLauncher(onPhotoTaken: (PhotoDraft) -> Unit): (taskId: Long) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // Переживает пересоздание активити, пока открыта камера
    var pending by rememberPhotoDraft()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val draft = pending
        pending = null
        if (saved && draft != null) onPhotoTaken(draft)
    }
    return remember(launcher, context, scope) {
        { taskId ->
            scope.launch {
                val uri = withContext(Dispatchers.IO) { createCameraPhotoUri(context) }
                pending = PhotoDraft(taskId, uri)
                try {
                    launcher.launch(uri)
                } catch (e: ActivityNotFoundException) {
                    pending = null
                    Toast.makeText(context, "Не найдено приложение камеры", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}

/** Выбор фото из галереи для заявки — заявка запоминается так же, как при съёмке. */
@Composable
fun rememberPickPhotoLauncher(onPhotoPicked: (PhotoDraft) -> Unit): (taskId: Long) -> Unit {
    var pendingTaskId by rememberSaveable { mutableStateOf<Long?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val taskId = pendingTaskId
        pendingTaskId = null
        if (uri != null && taskId != null) onPhotoPicked(PhotoDraft(taskId, uri))
    }
    return remember(launcher) {
        { taskId ->
            pendingTaskId = taskId
            launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        }
    }
}

private fun createCameraPhotoUri(context: Context): Uri {
    // Не cacheDir: при нехватке места система чистит кеш, пока открыта камера,
    // и снимку некуда записаться
    val dir = File(context.filesDir, PendingPhotoStore.CAMERA_DIR_NAME).apply { mkdirs() }
    // Прошлые снимки уже скопированы в очередь или отклонены — оригиналы не копим
    dir.listFiles()?.forEach { it.delete() }
    val file = File(dir, "photo_${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}
