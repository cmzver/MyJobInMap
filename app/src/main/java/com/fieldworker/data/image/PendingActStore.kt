package com.fieldworker.data.image

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Файлы акта в офлайн-очереди: подписи клиента и мастера (PNG) и траектория
 * росчерка. Каждый акт — своя папка по ID операции в files/pending_acts:
 * переживает перезапуск, удаляется после отправки или отмены.
 */
@Singleton
class PendingActStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private const val DIR_NAME = "pending_acts"
        private const val CUSTOMER = "customer.png"
        private const val WORKER = "worker.png"
        private const val STROKES = "strokes.json"
    }

    private val root: File
        get() = File(context.filesDir, DIR_NAME).apply { mkdirs() }

    fun create(
        operationId: String,
        customerSignature: ByteArray?,
        workerSignature: ByteArray?,
        strokesJson: String?,
    ): File {
        val dir = File(root, operationId).apply { mkdirs() }
        try {
            customerSignature?.let { File(dir, CUSTOMER).writeBytes(it) }
            workerSignature?.let { File(dir, WORKER).writeBytes(it) }
            strokesJson?.let { File(dir, STROKES).writeText(it) }
        } catch (e: IOException) {
            // Половина подписей в очереди хуже, чем ничего: акт ушёл бы без них
            dir.deleteRecursively()
            throw e
        }
        return dir
    }

    fun customerSignature(dir: File): File? = File(dir, CUSTOMER).takeIf { it.isFile }

    fun workerSignature(dir: File): File? = File(dir, WORKER).takeIf { it.isFile }

    fun strokes(dir: File): String? = File(dir, STROKES).takeIf { it.isFile }?.readText()

    /** Удалить папку акта — только внутри files/pending_acts. */
    fun delete(path: String?) {
        val dir = path?.let(::File) ?: return
        if (dir.canonicalFile.parentFile == root.canonicalFile) dir.deleteRecursively()
    }
}
