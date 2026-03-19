package com.fieldworker.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fieldworker.domain.model.ConversationType
import kotlin.math.abs

@Composable
fun ChatAvatar(
    name: String?,
    id: Long?,
    type: ConversationType,
    modifier: Modifier = Modifier,
    size: Int = 44,
) {
    val initials = getInitials(name)
    val bgColor = getAvatarColor(id ?: 0L, type)
    Box(
        modifier = modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(bgColor),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = initials,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = (size * 0.44f).sp,
            textAlign = TextAlign.Center,
            maxLines = 1
        )
    }
}

private fun getInitials(name: String?): String {
    if (name.isNullOrBlank()) return "?"
    val parts = name.trim().split(" ", limit = 2)
    return parts.mapNotNull { it.firstOrNull()?.uppercase() }.joinToString("").take(2)
}

@Composable
private fun getAvatarColor(id: Long, type: ConversationType): Color {
    // Telegram-style: цвет по id, fallback по типу
    val palette = listOf(
        Color(0xFF4A90E2), Color(0xFF50E3C2), Color(0xFFF5A623), Color(0xFFD0021B),
        Color(0xFFB8E986), Color(0xFFBD10E0), Color(0xFF7ED321), Color(0xFF417505),
        Color(0xFF9013FE), Color(0xFF8B572A), Color(0xFF00B8D9), Color(0xFF0052CC)
    )
    return when (type) {
        ConversationType.DIRECT, ConversationType.GROUP -> palette[(abs(id) % palette.size).toInt()]
        ConversationType.TASK -> MaterialTheme.colorScheme.tertiaryContainer
        ConversationType.ORG_GENERAL -> MaterialTheme.colorScheme.surfaceVariant
    }
}
