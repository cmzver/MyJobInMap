package com.fieldworker.next.core.designsystem

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun FwShimmerBox(
    modifier: Modifier = Modifier,
) {
    val transition = rememberInfiniteTransition()
    val alpha by transition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.7f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
    )
    Box(
        modifier = modifier
            .clip(MaterialTheme.shapes.small)
            .background(FwTheme.extended.shimmer)
            .graphicsLayer { this.alpha = alpha },
    )
}

@Composable
fun FwCardSkeleton(
    modifier: Modifier = Modifier,
) {
    FwCard(modifier = modifier) {
        Row {
            FwShimmerBox(Modifier.size(40.dp).clip(CircleShape))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                FwShimmerBox(Modifier.fillMaxWidth(0.6f).height(14.dp))
                Spacer(Modifier.height(8.dp))
                FwShimmerBox(Modifier.fillMaxWidth(0.9f).height(12.dp))
                Spacer(Modifier.height(6.dp))
                FwShimmerBox(Modifier.fillMaxWidth(0.4f).height(12.dp))
            }
        }
    }
}

@Composable
fun FwListSkeleton(
    count: Int = 5,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        repeat(count) {
            FwCardSkeleton()
            if (it < count - 1) Spacer(Modifier.height(8.dp))
        }
    }
}
