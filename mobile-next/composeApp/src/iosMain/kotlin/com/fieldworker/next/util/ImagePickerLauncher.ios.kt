package com.fieldworker.next.util

import androidx.compose.runtime.Composable

@Composable
actual fun rememberImagePickerLauncher(
    onResult: (fileName: String, fileBytes: ByteArray, mimeType: String) -> Unit,
): () -> Unit {
    // iOS image picker not yet implemented
    return {}
}
