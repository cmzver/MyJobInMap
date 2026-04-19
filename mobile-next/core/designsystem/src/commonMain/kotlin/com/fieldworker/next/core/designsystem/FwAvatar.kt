package com.fieldworker.next.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class AvatarSize(val dp: Dp, val fontSize: Int) {
    Small(32.dp, 12),
    Medium(40.dp, 15),
    Large(56.dp, 20),
    ExtraLarge(72.dp, 26),
}

@Composable
fun FwAvatar(
    name: String,
    modifier: Modifier = Modifier,
    size: AvatarSize = AvatarSize.Medium,
    online: Boolean = false,
) {
    val initials = name.trim()
        .split(" ")
        .take(2)
        .mapNotNull { it.firstOrNull()?.uppercase() }
        .joinToString("")
        .ifEmpty { "?" }

    val bgColor = avatarColor(name)

    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .size(size.dp)
                .clip(CircleShape)
                .background(bgColor),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = initials,
                color = Color.White,
                fontSize = size.fontSize.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }

        if (online) {
            val dotSize = when (size) {
                AvatarSize.Small -> 8.dp
                AvatarSize.Medium -> 10.dp
                AvatarSize.Large -> 12.dp
                AvatarSize.ExtraLarge -> 14.dp
            }
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = (-1).dp, y = (-1).dp)
                    .size(dotSize)
                    .clip(CircleShape)
                    .background(Color.White)
                    .border(1.5.dp, Color.White, CircleShape),
            ) {
                Box(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .size(dotSize - 3.dp)
                        .clip(CircleShape)
                        .background(FwColors.Green500),
                )
            }
        }
    }
}

private fun avatarColor(name: String): Color {
    val palette = listOf(
        Color(0xFF2563EB), // blue
        Color(0xFF7C3AED), // violet
        Color(0xFFDB2777), // pink
        Color(0xFFDC2626), // red
        Color(0xFFEA580C), // orange
        Color(0xFF0D9488), // teal
        Color(0xFF16A34A), // green
        Color(0xFF2563EB), // blue variant
    )
    val hash = name.fold(0) { acc, c -> acc * 31 + c.code }
    return palette[(hash and 0x7FFFFFFF) % palette.size]
}
