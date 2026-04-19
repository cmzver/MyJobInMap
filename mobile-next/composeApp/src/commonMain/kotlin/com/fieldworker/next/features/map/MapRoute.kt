package com.fieldworker.next.features.map

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
expect fun MapRoute(
    modifier: Modifier = Modifier,
    onTaskSelected: (Long) -> Unit,
)
