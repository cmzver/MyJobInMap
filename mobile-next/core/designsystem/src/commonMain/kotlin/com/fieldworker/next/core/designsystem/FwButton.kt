package com.fieldworker.next.core.designsystem

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

enum class FwButtonStyle { Primary, Secondary, Destructive, Ghost }

@Composable
fun FwButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: FwButtonStyle = FwButtonStyle.Primary,
    enabled: Boolean = true,
    loading: Boolean = false,
    leadingIcon: @Composable (() -> Unit)? = null,
) {
    val isEnabled = enabled && !loading

    when (style) {
        FwButtonStyle.Primary -> {
            Button(
                onClick = onClick,
                modifier = modifier.height(48.dp),
                enabled = isEnabled,
                shape = MaterialTheme.shapes.medium,
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            ) {
                ButtonContent(text, loading, leadingIcon)
            }
        }
        FwButtonStyle.Secondary -> {
            OutlinedButton(
                onClick = onClick,
                modifier = modifier.height(48.dp),
                enabled = isEnabled,
                shape = MaterialTheme.shapes.medium,
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
            ) {
                ButtonContent(text, loading, leadingIcon)
            }
        }
        FwButtonStyle.Destructive -> {
            Button(
                onClick = onClick,
                modifier = modifier.height(48.dp),
                enabled = isEnabled,
                shape = MaterialTheme.shapes.medium,
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
            ) {
                ButtonContent(text, loading, leadingIcon)
            }
        }
        FwButtonStyle.Ghost -> {
            TextButton(
                onClick = onClick,
                modifier = modifier.height(48.dp),
                enabled = isEnabled,
                shape = MaterialTheme.shapes.medium,
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            ) {
                ButtonContent(text, loading, leadingIcon)
            }
        }
    }
}

@Composable
private fun ButtonContent(
    text: String,
    loading: Boolean,
    leadingIcon: @Composable (() -> Unit)?,
) {
    if (loading) {
        CircularProgressIndicator(
            modifier = Modifier.size(18.dp),
            strokeWidth = 2.dp,
            color = Color.White.copy(alpha = 0.8f),
        )
        Spacer(Modifier.width(8.dp))
    } else {
        leadingIcon?.let {
            it()
            Spacer(Modifier.width(8.dp))
        }
    }
    Text(text, style = MaterialTheme.typography.labelLarge)
}
