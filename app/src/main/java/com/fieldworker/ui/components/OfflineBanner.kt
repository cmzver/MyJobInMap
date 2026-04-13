package com.fieldworker.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * Баннер офлайн-режима.
 *
 * Показывается когда нет подключения к серверу.
 * При восстановлении соединения ненадолго показывает «Подключение восстановлено»,
 * затем плавно скрывается.
 */
@Composable
fun OfflineBanner(
    isOffline: Boolean,
    pendingActionsCount: Int = 0,
    modifier: Modifier = Modifier
) {
    var showReconnected by remember { mutableStateOf(false) }
    var wasOffline by remember { mutableStateOf(false) }

    LaunchedEffect(isOffline) {
        if (isOffline) {
            wasOffline = true
            showReconnected = false
        } else if (wasOffline) {
            showReconnected = true
            delay(3_000L)
            showReconnected = false
            wasOffline = false
        }
    }

    val visible = isOffline || showReconnected

    AnimatedVisibility(
        visible = visible,
        enter = expandVertically(expandFrom = Alignment.Top),
        exit = shrinkVertically(shrinkTowards = Alignment.Top),
        modifier = modifier
    ) {
        val backgroundColor = if (isOffline) {
            MaterialTheme.colorScheme.errorContainer
        } else {
            Color(0xFF2E7D32)
        }

        val contentColor = if (isOffline) {
            MaterialTheme.colorScheme.onErrorContainer
        } else {
            Color.White
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(backgroundColor)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (isOffline) Icons.Default.Warning else Icons.Default.CheckCircle,
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size(16.dp)
            )
            val text = if (isOffline) {
                if (pendingActionsCount > 0) {
                    "Офлайн-режим • Несинхронизировано: $pendingActionsCount"
                } else {
                    "Нет подключения к серверу • Офлайн-режим"
                }
            } else {
                "Подключение восстановлено"
            }
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                color = contentColor,
                modifier = Modifier.padding(start = 8.dp)
            )
        }
    }
}
