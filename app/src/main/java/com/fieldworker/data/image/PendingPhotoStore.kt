package com.fieldworker.data.image

import android.content.Context
import android.net.Uri
import android.util.Log
import android.webkit.MimeTypeMap
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.TimeUnit
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
        /** Оригиналы системной камеры — путь объявлен в file_provider_paths.xml. */
        const val CAMERA_DIR_NAME = "camera"
        /** Сохранённый, но так и не попавший в очередь файл (сбой между ними) — сирота. */
        private val ORPHAN_AGE_MS = TimeUnit.HOURS.toMillis(1)
    }

    private val dir: File
        get() = File(context.filesDir, DIR_NAME).apply { mkdirs() }

    /**
     * Сжать (как перед отправкой) и сохранить снимок под именем [name].
     * Возвращает файл или null, если снимок не удалось прочитать.
     */
    suspend fun save(imageUri: Uri, name: String): File? = withContext(Dispatchers.IO) {
        try {
            write(imageUri, name)
                // Камера могла ответить «готово», не записав снимок, — пустой файл сервер отвергнет
                ?.takeIf { it.length() > 0 }
                ?: run { deleteNamed(name); null }
        } catch (e: Exception) {
            // В том числе отмена: недописанный файл не должен остаться в папке
            deleteNamed(name)
            if (e is CancellationException) throw e
            Log.w(TAG, "Failed to store pending photo: ${e.message}", e)
            null
        }
    }

    private suspend fun write(imageUri: Uri, name: String): File? {
        val compressed = imageCompressor.compress(imageUri, fileNamePrefix = "photo")
        if (compressed != null) {
            return File(dir, "$name.jpg").apply { writeBytes(compressed.bytes) }
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
        return if (copied == null) null else file
    }

    private fun deleteNamed(name: String) {
        dir.listFiles { file -> file.nameWithoutExtension == name }?.forEach { it.delete() }
    }

    fun delete(path: String?) {
        if (path.isNullOrBlank()) return
        File(path).takeIf { it.parentFile == dir }?.delete()
    }

    /** Удалить файлы, на которые не ссылается очередь (кроме только что сохранённых). */
    fun pruneOrphans(referencedPaths: Set<String>) {
        val cutoff = System.currentTimeMillis() - ORPHAN_AGE_MS
        dir.listFiles()
            ?.filter { it.absolutePath !in referencedPaths && it.lastModified() < cutoff }
            ?.forEach { it.delete() }
    }

    /** Оригиналы камеры: снимок уже скопирован в очередь или от него отказались. */
    fun clearCameraShots() {
        File(context.filesDir, CAMERA_DIR_NAME).listFiles()?.forEach { it.delete() }
    }

    /** При выходе из аккаунта очередь очищается — снимки ей больше не нужны. */
    fun clear() {
        dir.listFiles()?.forEach { it.delete() }
    }
}
