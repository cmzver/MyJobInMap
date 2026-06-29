package com.fieldworker.ui.addresses

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fieldworker.domain.model.AddressDetails
import com.fieldworker.domain.model.AddressPanel
import com.fieldworker.domain.model.AddressSummary

/**
 * Раздел «Мои адреса»: список назначенных адресов и карточка с возможностью
 * открыть дверь на сетевой панели. Менеджер видит назначенные ему адреса;
 * рядовому сотруднику доступны только привязанные к нему адреса.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyAddressesScreen(
    onOpenDrawer: () -> Unit,
    viewModel: MyAddressesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }
    LaunchedEffect(state.error) {
        state.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeError()
        }
    }

    val showDetail = state.selected != null || state.isLoadingDetails
    BackHandler(enabled = showDetail) { viewModel.closeAddress() }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = if (showDetail) "Карточка адреса" else "Мои адреса",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                },
                navigationIcon = {
                    if (showDetail) {
                        IconButton(onClick = { viewModel.closeAddress() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                        }
                    } else {
                        IconButton(onClick = onOpenDrawer) {
                            Icon(Icons.Default.Menu, contentDescription = "Меню")
                        }
                    }
                },
                actions = {
                    if (!showDetail) {
                        IconButton(onClick = { viewModel.loadAddresses() }) {
                            Icon(Icons.Default.Refresh, contentDescription = "Обновить")
                        }
                    }
                },
            )
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                showDetail -> AddressDetailContent(
                    details = state.selected,
                    isLoading = state.isLoadingDetails,
                    openingPanelId = state.openingPanelId,
                    onOpenDoor = viewModel::openDoor,
                )

                state.isLoading && !state.hasLoaded ->
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))

                state.addresses.isEmpty() -> EmptyState(
                    modifier = Modifier.align(Alignment.Center),
                )

                else -> AddressList(
                    addresses = state.addresses,
                    onClick = { viewModel.openAddress(it.id) },
                )
            }
        }
    }
}

@Composable
private fun AddressList(
    addresses: List<AddressSummary>,
    onClick: (AddressSummary) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(addresses, key = { it.id }) { address ->
            AddressRowCard(address = address, onClick = { onClick(address) })
        }
    }
}

@Composable
private fun AddressRowCard(address: AddressSummary, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = MaterialTheme.shapes.large,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Default.Home,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = address.address,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                val sub = listOfNotNull(
                    address.city?.takeIf { it.isNotBlank() },
                ).joinToString(" • ")
                if (sub.isNotBlank()) {
                    Text(
                        text = sub,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyState(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Default.Home,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(40.dp),
        )
        Text(
            text = "Адреса не назначены",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = "Когда диспетчер или администратор назначит вам адрес, он появится здесь.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun AddressDetailContent(
    details: AddressDetails?,
    isLoading: Boolean,
    openingPanelId: Long?,
    onOpenDoor: (addressId: Long, panelId: Long) -> Unit,
) {
    if (isLoading || details == null) {
        Box(modifier = Modifier.fillMaxSize()) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
        }
        return
    }

    var pendingPanel by remember { mutableStateOf<AddressPanel?>(null) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SectionCard(title = details.address) {
                val buildingFacts = buildList {
                    details.entranceCount?.let { add("подъездов: $it") }
                    details.floorCount?.let { add("этажей: $it") }
                    details.apartmentCount?.let { add("квартир: $it") }
                }.joinToString(" • ")
                if (buildingFacts.isNotBlank()) {
                    Text(
                        text = buildingFacts,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                details.intercomCode?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        text = "Код домофона: $it",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }

        item {
            SectionCard(title = "Панели и двери") {
                if (details.panels.isEmpty()) {
                    Text(
                        text = "На этом адресе нет сетевых панелей.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        details.panels.forEach { panel ->
                            PanelRow(
                                panel = panel,
                                isOpening = openingPanelId == panel.id,
                                onOpen = { pendingPanel = panel },
                            )
                        }
                    }
                }
            }
        }

        if (details.contacts.isNotEmpty()) {
            item {
                SectionCard(title = "Контакты") {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        details.contacts.forEach { contact ->
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = contact.name,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium,
                                )
                                val sub = listOfNotNull(contact.position, contact.phone)
                                    .filter { it.isNotBlank() }.joinToString(" • ")
                                if (sub.isNotBlank()) {
                                    Text(
                                        text = sub,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!details.notes.isNullOrBlank()) {
            item {
                SectionCard(title = "Заметки") {
                    Text(
                        text = details.notes!!,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }
    }

    pendingPanel?.let { panel ->
        AlertDialog(
            onDismissRequest = { pendingPanel = null },
            icon = { Icon(Icons.Default.Lock, contentDescription = null) },
            title = { Text("Открыть дверь") },
            text = {
                Text("Открыть дверь на панели «${panel.label ?: panel.ip}»?")
            },
            confirmButton = {
                Button(onClick = {
                    onOpenDoor(panel.addressId, panel.id)
                    pendingPanel = null
                }) { Text("Открыть") }
            },
            dismissButton = {
                TextButton(onClick = { pendingPanel = null }) { Text("Отмена") }
            },
        )
    }
}

@Composable
private fun PanelRow(
    panel: AddressPanel,
    isOpening: Boolean,
    onOpen: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = panel.label ?: panel.ip,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            val sub = listOfNotNull(
                panel.entrance?.takeIf { it.isNotBlank() }?.let { "подъезд $it" },
                panel.model?.takeIf { it.isNotBlank() },
            ).joinToString(" • ")
            if (sub.isNotBlank()) {
                Text(
                    text = sub,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Button(onClick = onOpen, enabled = !isOpening) {
            if (isOpening) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            } else {
                Icon(
                    Icons.Default.Lock,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Text("  Открыть")
            }
        }
    }
}

@Composable
private fun SectionCard(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = MaterialTheme.shapes.large,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            content(this)
        }
    }
}
