package com.fieldworker.next.util

import androidx.compose.runtime.Composable

/**
 * Returns a lambda that opens the platform image picker.
 * [onResult] is called with file name, raw bytes, and MIME type.
 */
@Composable
expect fun rememberImagePickerLauncher(
    onResult: (fileName: String, fileBytes: ByteArray, mimeType: String) -> Unit,
): () -> Unit
