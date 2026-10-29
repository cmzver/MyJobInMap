package com.fieldworker.data.image

import android.content.Context
import android.net.Uri
import android.util.Log
import android.webkit.MimeTypeMap
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Снимки, ждущие отправки на сервер. Байты копируются в личные файлы
 * приложения сразу: доступ к Uri из галереи временный, а очередь может
 * отправить фото через часы — после перезапуска приложения.
 */
@Singleton
class PendingPhotoStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val imageCompressor: ImageCompressor,
) {
    companion object {
        private const val TAG = "PendingPhotoStore"
        private const val DIR_NAME = "pending_photos"
    }

    private val dir: File
        get() = File(context.filesDir, DIR_NAME).apply { mkdirs() }

    /**
     * Сжать (как перед отправкой) и сохранить снимок под именем [name].
     * Возвращает файл или null, если снимок не удалось прочитать.
     */
    suspend fun save(imageUri: Uri, name: String): File? = withContext(Dispatchers.IO) {
        try {
            val compressed = imageCompressor.compress(imageUri, fileNamePrefix = "photo")
            if (compressed != null) {
                return@withContext File(dir, "$name.jpg").apply { writeBytes(compressed.bytes) }
            }
            // Не декодировалось (например, HEIC на старых API) — сохраняем как есть
            val resolver = context.contentResolver
            val extension = resolver.getType(imageUri)
                ?.let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) }
                ?: "jpg"
            val file = File(dir, "$name.$extension")
            val copied = resolver.openInputStream(imageUri)?.use { input ->
                file.outputStream().use { output -> input.copyTo(output) }
            }
            if (copied == null) null else file
        } catch (e: Exception) {
            Log.w(TAG, "Failed to store pending photo: ${e.message}", e)
            null
        }
    }

    fun delete(path: String?) {
        if (path.isNullOrBlank()) return
        File(path).takeIf { it.parentFile == dir }?.delete()
    }

    /** При выходе из аккаунта очередь очищается — снимки ей больше не нужны. */
    fun clear() {
        dir.listFiles()?.forEach { it.delete() }
    }
}
