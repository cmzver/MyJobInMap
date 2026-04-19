package com.fieldworker.next.features.map

import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.fieldworker.next.core.designsystem.FwColors
import com.fieldworker.next.domain.model.TaskStatus
import com.fieldworker.next.domain.model.TaskSummary
import org.koin.compose.viewmodel.koinViewModel
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker

@Composable
actual fun MapRoute(
    modifier: Modifier,
    onTaskSelected: (Long) -> Unit,
) {
    val viewModel = koinViewModel<MapViewModel>()
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    // Configure osmdroid user agent (required)
    remember {
        Configuration.getInstance().userAgentValue = context.packageName
        true
    }

    Box(modifier = modifier.fillMaxSize()) {
        if (state.isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center),
                color = MaterialTheme.colorScheme.primary,
            )
        } else {
            val tasksWithCoordinates = remember(state.tasks) {
                state.tasks.filter { it.lat != null && it.lon != null }
            }

            val center = remember(tasksWithCoordinates) {
                if (tasksWithCoordinates.isNotEmpty()) {
                    val avgLat = tasksWithCoordinates.mapNotNull { it.lat }.average()
                    val avgLon = tasksWithCoordinates.mapNotNull { it.lon }.average()
                    GeoPoint(avgLat, avgLon)
                } else {
                    GeoPoint(55.751244, 37.618423) // Moscow default
                }
            }

            val mapView = remember { MapView(context) }

            DisposableEffect(Unit) {
                onDispose { mapView.onDetach() }
            }

            AndroidView(
                factory = {
                    mapView.apply {
                        setTileSource(TileSourceFactory.MAPNIK)
                        setMultiTouchControls(true)
                        controller.setZoom(12.0)
                        controller.setCenter(center)
                        // Disable built-in zoom buttons for cleaner UI
                        zoomController.setVisibility(
                            org.osmdroid.views.CustomZoomButtonsController.Visibility.NEVER,
                        )
                    }
                },
                modifier = Modifier.fillMaxSize(),
                update = { map ->
                    map.overlays.removeAll { it is Marker }
                    tasksWithCoordinates.forEach { task ->
                        val marker = Marker(map).apply {
                            position = GeoPoint(task.lat!!, task.lon!!)
                            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                            title = task.number
                            snippet = task.title
                            setOnMarkerClickListener { _, _ ->
                                viewModel.selectTask(task)
                                true
                            }
                        }
                        map.overlays.add(marker)
                    }
                    map.controller.setCenter(center)
                    map.invalidate()
                },
            )

            // Task count badge
            Card(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(16.dp),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.LocationOn,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "${tasksWithCoordinates.size} на карте",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }

            // Empty state when no tasks have coordinates
            if (tasksWithCoordinates.isEmpty()) {
                Card(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(32.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                    ),
                    elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.LocationOn,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = "Нет заявок с координатами",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "Заявки с адресами появятся на карте",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // Bottom sheet preview for selected task
            AnimatedVisibility(
                visible = state.selectedTask != null,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = slideInVertically { it } + fadeIn(),
                exit = slideOutVertically { it } + fadeOut(),
            ) {
                state.selectedTask?.let { task ->
                    TaskMapPreviewCard(
                        task = task,
                        onClick = { onTaskSelected(task.id) },
                        onDismiss = { viewModel.selectTask(null) },
                    )
                }
            }
        }
    }
}

@Composable
private fun TaskMapPreviewCard(
    task: TaskSummary,
    onClick: () -> Unit,
    onDismiss: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Status chip
                Text(
                    text = task.status.label,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = statusContentColor(task.status),
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(statusContainerColor(task.status))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )

                Text(
                    text = task.number,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(8.dp))

            Text(
                text = task.title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurface,
            )

            if (task.address.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Outlined.LocationOn,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = task.address,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            if (task.isOverdue) {
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Outlined.Warning,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = FwColors.Red500,
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = "Просрочена",
                        style = MaterialTheme.typography.labelSmall,
                        color = FwColors.Red500,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            Text(
                text = "Нажмите для подробностей →",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

private fun statusContainerColor(status: TaskStatus): Color = when (status) {
    TaskStatus.NEW -> FwColors.Blue50
    TaskStatus.IN_PROGRESS -> Color(0xFFFFF7ED)
    TaskStatus.DONE -> FwColors.Green50
    TaskStatus.CANCELLED -> FwColors.Slate100
}

private fun statusContentColor(status: TaskStatus): Color = when (status) {
    TaskStatus.NEW -> FwColors.Blue600
    TaskStatus.IN_PROGRESS -> FwColors.Amber600
    TaskStatus.DONE -> FwColors.Green700
    TaskStatus.CANCELLED -> FwColors.Slate500
}
