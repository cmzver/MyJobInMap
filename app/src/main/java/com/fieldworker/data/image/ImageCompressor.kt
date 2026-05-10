package com.fieldworker.data.image

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Сжимает изображение перед отправкой на сервер: ресайзит до [MAX_DIMENSION]px
 * по бОльшей стороне, кодирует JPEG с качеством [JPEG_QUALITY], уважает EXIF
 * orientation (иначе фото с телефона будет лежать на боку).
 *
 * Параметры подобраны под серверный image_optimizer (1920px / q85),
 * чтобы клиент уже отдавал результат, близкий к финальному, и не гонял
 * лишние мегабайты по сети.
 */
@Singleton
class ImageCompressor @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    data class Compressed(
        val bytes: ByteArray,
        val mimeType: String,
        val fileName: String,
    )

    /**
     * Возвращает сжатое JPEG-изображение либо `null`, если декодирование
     * не удалось (вызывающий код должен в этом случае отправить байты как есть).
     *
     * @param fileNamePrefix префикс для генерируемого имени файла (например, "photo", "avatar").
     */
    suspend fun compress(
        uri: Uri,
        fileNamePrefix: String = "image",
    ): Compressed? = withContext(Dispatchers.IO) {
        try {
            val resolver = context.contentResolver

            // 1) Узнаём размеры без полной декодировки.
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext null

            // 2) inSampleSize чтобы не держать в памяти полный 12-Мп bitmap.
            val sampleOptions = BitmapFactory.Options().apply {
                inSampleSize = calculateSampleSize(bounds.outWidth, bounds.outHeight, MAX_DIMENSION)
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val sampled = resolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, sampleOptions)
            } ?: return@withContext null

            // 3) Точный ресайз до MAX_DIMENSION + EXIF orientation.
            val rotation = readExifRotation(uri)
            val resized = resizeIfNeeded(sampled, MAX_DIMENSION)
            if (resized !== sampled) sampled.recycle()
            val rotated = if (rotation != 0) rotate(resized, rotation).also { resized.recycle() } else resized

            // 4) JPEG q85.
            val output = ByteArrayOutputStream()
            rotated.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)
            rotated.recycle()

            val bytes = output.toByteArray()
            Compressed(
                bytes = bytes,
                mimeType = "image/jpeg",
                fileName = "${fileNamePrefix}_${System.currentTimeMillis()}.jpg",
            )
        } catch (e: Throwable) {
            Log.w(TAG, "Image compression failed: ${e.message}", e)
            null
        }
    }

    private fun calculateSampleSize(width: Int, height: Int, target: Int): Int {
        var sample = 1
        var w = width
        var h = height
        while (w / 2 >= target && h / 2 >= target) {
            w /= 2
            h /= 2
            sample *= 2
        }
        return sample
    }

    private fun resizeIfNeeded(src: Bitmap, target: Int): Bitmap {
        val w = src.width
        val h = src.height
        val maxSide = maxOf(w, h)
        if (maxSide <= target) return src
        val ratio = target.toFloat() / maxSide
        val newW = (w * ratio).toInt().coerceAtLeast(1)
        val newH = (h * ratio).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(src, newW, newH, true)
    }

    private fun readExifRotation(uri: Uri): Int {
        return try {
            context.contentResolver.openInputStream(uri)?.use { stream ->
                val exif = ExifInterface(stream)
                when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
            } ?: 0
        } catch (_: Throwable) {
            0
        }
    }

    private fun rotate(src: Bitmap, degrees: Int): Bitmap {
        val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
        return Bitmap.createBitmap(src, 0, 0, src.width, src.height, matrix, true)
    }

    companion object {
        private const val TAG = "ImageCompressor"
        private const val MAX_DIMENSION = 1920
        private const val JPEG_QUALITY = 85
    }
}
