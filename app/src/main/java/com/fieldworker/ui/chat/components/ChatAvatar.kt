
package com.fieldworker.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.fieldworker.domain.model.ConversationType
import com.fieldworker.ui.utils.avatarInitials
import com.fieldworker.ui.utils.resolveAvatarUrl

@Composable
fun ChatAvatar(
    name: String?,
    type: ConversationType,
    modifier: Modifier = Modifier,
    avatarUrl: String? = null,
    baseUrl: String? = null,
    authToken: String? = null,
    size: Int = 44,
) {
    val initials = avatarInitials(name).ifEmpty { "?" }
    // Один спокойный тон для всех — как аватар в настройках: цвет в
    // интерфейсе несёт статус, «радуга» по id его размывала.
    val bgColor = MaterialTheme.colorScheme.primaryContainer
    val contentColor = MaterialTheme.colorScheme.onPrimaryContainer
    val context = LocalContext.current
    val borderColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f)
    val resolvedAvatarUrl = remember(avatarUrl, baseUrl) {
        resolveAvatarUrl(
            avatarUrl = avatarUrl,
            baseUrl = baseUrl,
        )
    }
    // Bearer-токен подставляется AuthHeaderInterceptor в OkHttp клиенте Coil.
    val imageRequest = remember(resolvedAvatarUrl) {
        resolvedAvatarUrl?.let { imageUrl ->
            ImageRequest.Builder(context)
                .data(imageUrl)
                .crossfade(false)
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
        } else if (type == ConversationType.TASK) {
            // Чат заявки: инициалы «Заявка 1138996» = «З1» читались как число «31»
            Icon(
                imageVector = Icons.Default.Build,
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size((size * 0.45f).dp),
            )
        } else {
            Text(
                text = initials,
                color = contentColor,
                fontWeight = FontWeight.SemiBold,
                fontSize = (size * 0.40f).sp,
                textAlign = TextAlign.Center,
                maxLines = 1
            )
        }
    }
}
