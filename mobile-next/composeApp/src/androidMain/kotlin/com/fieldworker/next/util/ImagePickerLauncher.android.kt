package com.fieldworker.next.util

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
actual fun rememberImagePickerLauncher(
    onResult: (fileName: String, fileBytes: ByteArray, mimeType: String) -> Unit,
): () -> Unit {
    val context = LocalContext.current
    var showDialog by remember { mutableStateOf(false) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    var cameraFileName by remember { mutableStateOf("photo.jpg") }

    // Process a content URI (from gallery or camera)
    fun processUri(uri: Uri) {
        val contentResolver = context.contentResolver
        val mimeType = contentResolver.getType(uri) ?: "image/jpeg"

        var fileName = "photo.jpg"
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0) {
                        fileName = cursor.getString(idx) ?: fileName
                    }
                }
            }

        val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() }
        if (bytes != null) {
            onResult(fileName, bytes, mimeType)
        }
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri -> if (uri != null) processUri(uri) }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
    ) { success ->
        if (success) {
            cameraUri?.let { uri -> processUri(uri) }
        }
    }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = { Text("Добавить фото") },
            text = { Text("Выберите источник") },
            confirmButton = {
                TextButton(onClick = {
                    showDialog = false
                    // Create temp file for camera
                    val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
                    cameraFileName = "IMG_$timeStamp.jpg"
                    val imageFile = File(context.cacheDir, cameraFileName)
                    val uri = FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        imageFile,
                    )
                    cameraUri = uri
                    cameraLauncher.launch(uri)
                }) { Text("Камера") }
            },
            dismissButton = {
                TextButton(onClick = {
                    showDialog = false
                    galleryLauncher.launch("image/*")
                }) { Text("Галерея") }
            },
        )
    }

    return { showDialog = true }
}
