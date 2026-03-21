
package com.fieldworker.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.fieldworker.domain.model.ConversationType
import okhttp3.Headers
import kotlin.math.abs

@Composable
fun ChatAvatar(
    name: String?,
    id: Long?,
    type: ConversationType,
    avatarUrl: String? = null,
    baseUrl: String? = null,
    authToken: String? = null,
    modifier: Modifier = Modifier,
    size: Int = 44,
) {
    val initials = getInitials(name)
    val bgColor = getAvatarColor(id ?: 0L, type)
    val context = LocalContext.current
    val borderColor = if (size <= 30) {
        Color.White.copy(alpha = 0.78f)
    } else {
        MaterialTheme.colorScheme.surface.copy(alpha = 0.92f)
    }
    val resolvedAvatarUrl = remember(avatarUrl, baseUrl) {
        resolveAvatarUrl(
            avatarUrl = avatarUrl,
            baseUrl = baseUrl,
        )
    }
    val imageRequest = remember(resolvedAvatarUrl, authToken) {
        resolvedAvatarUrl?.let { imageUrl ->
            ImageRequest.Builder(context)
                .data(imageUrl)
                .apply {
                    if (!authToken.isNullOrBlank()) {
                        headers(
                            Headers.Builder()
                                .add("Authorization", "Bearer $authToken")
                                .build()
                        )
                    }
                }
                .crossfade(true)
                .build()
        }
    }
    Box(
        modifier = modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(bgColor)
            .border(
                width = if (size <= 30) 1.dp else 1.5.dp,
                color = borderColor,
                shape = CircleShape,
            ),
        contentAlignment = Alignment.Center
    ) {
        if (imageRequest != null) {
            AsyncImage(
                model = imageRequest,
                contentDescription = name ?: "Аватар",
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
        } else {
            Text(
                text = initials,
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
                fontSize = (size * 0.40f).sp,
                textAlign = TextAlign.Center,
                maxLines = 1
            )
        }
    }
}

private fun getInitials(name: String?): String {
    if (name.isNullOrBlank()) return "?"
    val parts = name.trim().split(" ", limit = 2)
    return parts.mapNotNull { it.firstOrNull()?.uppercase() }.joinToString("").take(2)
}

private fun resolveAvatarUrl(avatarUrl: String?, baseUrl: String?): String? {
    val normalizedAvatarUrl = avatarUrl?.trim().takeUnless { it.isNullOrBlank() } ?: return null
    if (
        normalizedAvatarUrl.startsWith("http://") ||
        normalizedAvatarUrl.startsWith("https://")
    ) {
        return normalizedAvatarUrl
    }

    val normalizedBaseUrl = baseUrl?.trimEnd('/').takeUnless { it.isNullOrBlank() } ?: return null
    val normalizedPath = if (normalizedAvatarUrl.startsWith("/")) {
        normalizedAvatarUrl
    } else {
        "/$normalizedAvatarUrl"
    }
    return normalizedBaseUrl + normalizedPath
}

@Composable
private fun getAvatarColor(id: Long, type: ConversationType): Color {
    // Telegram-style: цвет по id, fallback по типу
    val palette = listOf(
        Color(0xFF8F6CE3), Color(0xFF53A7EE), Color(0xFFEE74A6), Color(0xFF57C06D),
        Color(0xFFF39A45), Color(0xFF08A6B5), Color(0xFF6B7EF6), Color(0xFF66B962),
        Color(0xFFCA5D97), Color(0xFF3D8FD2), Color(0xFF7B63E7), Color(0xFF4FB89E)
    )
    return when (type) {
        ConversationType.DIRECT, ConversationType.GROUP -> palette[(abs(id) % palette.size).toInt()]
        ConversationType.TASK -> MaterialTheme.colorScheme.tertiaryContainer
        ConversationType.ORG_GENERAL -> MaterialTheme.colorScheme.surfaceVariant
    }
}
