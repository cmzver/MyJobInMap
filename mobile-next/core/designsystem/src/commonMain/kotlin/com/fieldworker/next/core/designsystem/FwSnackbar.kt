package com.fieldworker.next.core.designsystem

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Error
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

enum class SnackbarType(val icon: ImageVector) {
    Success(Icons.Outlined.CheckCircle),
    Error(Icons.Outlined.Error),
    Info(Icons.Outlined.Info),
}

@Composable
fun FwSnackbar(
    data: SnackbarData,
    type: SnackbarType = SnackbarType.Info,
) {
    val (containerColor, contentColor) = when (type) {
        SnackbarType.Success -> FwTheme.extended.success to FwTheme.extended.onSuccess
        SnackbarType.Error -> MaterialTheme.colorScheme.error to MaterialTheme.colorScheme.onError
        SnackbarType.Info -> MaterialTheme.colorScheme.inverseSurface to MaterialTheme.colorScheme.inverseOnSurface
    }

    Snackbar(
        shape = MaterialTheme.shapes.medium,
        containerColor = containerColor,
        contentColor = contentColor,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = type.icon,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = contentColor,
            )
            Text(
                text = data.visuals.message,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
