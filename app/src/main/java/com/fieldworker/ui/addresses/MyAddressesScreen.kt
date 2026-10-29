package com.fieldworker.ui.addresses

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Phone
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fieldworker.domain.model.AddressContact
import com.fieldworker.domain.model.AddressDetails
import com.fieldworker.domain.model.AddressDocument
import com.fieldworker.domain.model.AddressEquipment
import com.fieldworker.domain.model.AddressHistoryEntry
import com.fieldworker.domain.model.AddressPanel
import com.fieldworker.domain.model.AddressSummary
import com.fieldworker.domain.model.AddressSystem
import com.fieldworker.domain.model.AddressTaskStats
import com.fieldworker.domain.model.TaskStatus
import com.fieldworker.ui.theme.AppColors
import com.fieldworker.ui.theme.AppShape
import com.fieldworker.ui.utils.TaskUtils
import com.fieldworker.ui.utils.contentColor
import com.fieldworker.ui.utils.formatPhoneForDisplay
import com.fieldworker.ui.utils.normalizePhoneForDial

/**
 * Раздел «Мои адреса»: список назначенных адресов и полная карточка объекта —
 * характеристики дома, статистика заявок, панели/двери (с открытием), системы,
 * оборудование, управляющая компания, контакты, документы и история изменений.
 * Менеджер видит назначенные ему адреса; рядовому сотруднику — только
 * привязанные к нему.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyAddressesScreen(
    onBack: () -> Unit,
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
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
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
internal fun AddressList(
    addresses: List<AddressSummary>,
    onClick: (AddressSummary) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
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
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
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
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = address.address,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                val sub = cityHint(address.address, address.city)
                if (sub.isNotBlank()) {
                    Text(
                        text = sub,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
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

// ---------------------------------------------------------------------------
// Карточка адреса
// ---------------------------------------------------------------------------

@Composable
internal fun AddressDetailContent(
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

    val context = LocalContext.current
    var pendingPanel by remember { mutableStateOf<AddressPanel?>(null) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { HeaderCard(details) }

        if (details.taskStats.total > 0) {
            item { TaskStatsCard(details.taskStats) }
        }

        item {
            SectionCard(title = "Панели и двери") {
                if (details.panels.isEmpty()) {
                    EmptyLine("На этом адресе нет сетевых панелей.")
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

        if (details.systems.isNotEmpty()) {
            item {
                SectionCard(title = "Системы") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        details.systems.forEach { SystemRow(it) }
                    }
                }
            }
        }

        if (details.equipment.isNotEmpty()) {
            item {
                SectionCard(title = "Оборудование") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        details.equipment.forEach { EquipmentRow(it) }
                    }
                }
            }
        }

        if (!details.managementCompany.isNullOrBlank() || !details.managementPhone.isNullOrBlank()) {
            item {
                SectionCard(title = "Управляющая компания") {
                    details.managementCompany?.takeIf { it.isNotBlank() }?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    details.managementPhone?.takeIf { it.isNotBlank() }?.let { phone ->
                        PhoneLine(phone) { dial(context, phone) }
                    }
                }
            }
        }

        if (details.contacts.isNotEmpty()) {
            item {
                SectionCard(title = "Контакты") {
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        details.contacts.forEach { ContactRow(it, context) }
                    }
                }
            }
        }

        if (details.documents.isNotEmpty()) {
            item {
                SectionCard(title = "Документы") {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        details.documents.forEach { DocumentRow(it) }
                    }
                }
            }
        }

        if (details.history.isNotEmpty()) {
            item {
                SectionCard(title = "История") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        details.history.forEach { HistoryRow(it) }
                    }
                }
            }
        }

        val notes = details.notes?.takeIf { it.isNotBlank() }
        val extra = details.extraInfo?.takeIf { it.isNotBlank() }
        if (notes != null || extra != null) {
            item {
                SectionCard(title = "Заметки") {
                    notes?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    extra?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }

    pendingPanel?.let { panel ->
        AlertDialog(
            onDismissRequest = { pendingPanel = null },
            icon = { Icon(Icons.Default.Lock, contentDescription = null) },
            title = { Text("Открыть дверь") },
            text = { Text("Открыть дверь на панели «${panel.label ?: panel.ip}»?") },
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
private fun HeaderCard(details: AddressDetails) {
    SectionCard(title = details.address) {
        val locality = cityHint(details.address, details.city)
        if (locality.isNotBlank()) {
            Text(
                text = locality,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        val facts = buildList {
            details.entranceCount?.let { add("Подъезды" to it.toString()) }
            details.floorCount?.let { add("Этажи" to it.toString()) }
            details.apartmentCount?.let { add("Квартиры" to it.toString()) }
            details.entrance?.takeIf { it.isNotBlank() }?.let { add("Подъезд" to it) }
            if (details.hasElevator != null) add("Лифт" to if (details.hasElevator) "есть" else "нет")
            if (details.hasIntercom != null) add("Домофон" to if (details.hasIntercom) "есть" else "нет")
        }
        if (facts.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                facts.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        pair.forEach { (label, value) ->
                            LabeledValue(label, value, modifier = Modifier.weight(1f))
                        }
                        if (pair.size == 1) Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }

        details.intercomCode?.takeIf { it.isNotBlank() }?.let { code ->
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                        AppShape.sm,
                    )
                    .padding(horizontal = 12.dp, vertical = 10.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Eyebrow("Код домофона")
                    Text(
                        text = code,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}

@Composable
private fun TaskStatsCard(stats: AddressTaskStats) {
    SectionCard(title = "Заявки") {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            StatPill("Всего", stats.total, MaterialTheme.colorScheme.onSurfaceVariant)
            if (stats.newCount > 0) StatPill("Новые", stats.newCount, TaskStatus.NEW.contentColor())
            if (stats.inProgress > 0) StatPill("В работе", stats.inProgress, TaskStatus.IN_PROGRESS.contentColor())
            if (stats.done > 0) StatPill("Выполнено", stats.done, TaskStatus.DONE.contentColor())
            if (stats.cancelled > 0) StatPill("Отменено", stats.cancelled, TaskStatus.CANCELLED.contentColor())
        }
    }
}

@Composable
private fun StatPill(label: String, count: Int, base: Color) {
    Column(
        modifier = Modifier
            .background(base.copy(alpha = 0.12f), AppShape.md)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = base,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SystemRow(system: AddressSystem) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = system.name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            system.status.takeIf { it.isNotBlank() }?.let {
                StatusChip(systemStatusLabel(it), systemStatusTone(it))
            }
        }
        Eyebrow(systemTypeLabel(system.systemType))
        system.notes?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun EquipmentRow(equipment: AddressEquipment) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = equipment.name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            equipment.status.takeIf { it.isNotBlank() }?.let {
                StatusChip(equipmentStatusLabel(it), equipmentStatusTone(it))
            }
        }
        val sub = listOfNotNull(
            equipmentTypeLabel(equipment.equipmentType),
            equipment.model?.takeIf { it.isNotBlank() },
            equipment.location?.takeIf { it.isNotBlank() },
            equipment.quantity.takeIf { it > 1 }?.let { "×$it" },
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

@Composable
private fun ContactRow(contact: AddressContact, context: android.content.Context) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = contact.name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            if (contact.isPrimary) StatusChip("Основной", StatusTone.POSITIVE)
        }
        val role = listOfNotNull(
            contactTypeLabel(contact.contactType).takeIf { it.isNotBlank() },
            contact.position?.takeIf { it.isNotBlank() },
        ).joinToString(" • ")
        if (role.isNotBlank()) Eyebrow(role)
        contact.phone?.takeIf { it.isNotBlank() }?.let { phone ->
            PhoneLine(phone) { dial(context, phone) }
        }
        contact.email?.takeIf { it.isNotBlank() }?.let { email ->
            Row(
                modifier = Modifier.clickable { mail(context, email) },
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Default.Email,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = email,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun DocumentRow(document: AddressDocument) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = document.name,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        val sub = listOfNotNull(
            documentTypeLabel(document.docType).takeIf { it.isNotBlank() },
            document.createdByName?.takeIf { it.isNotBlank() },
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

@Composable
private fun HistoryRow(entry: AddressHistoryEntry) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = historyEventLabel(entry.eventType),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        entry.description.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        val footer = listOfNotNull(
            entry.userName?.takeIf { it.isNotBlank() },
            runCatching { TaskUtils.formatShortDate(entry.createdAt) }.getOrNull(),
        ).joinToString(" • ")
        if (footer.isNotBlank()) {
            Text(
                text = footer,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
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
                Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Открыть")
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Мелкие переиспользуемые элементы
// ---------------------------------------------------------------------------

@Composable
private fun SectionCard(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
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

@Composable
private fun Eyebrow(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        letterSpacing = 0.6.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun LabeledValue(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(1.dp)) {
        Eyebrow(label)
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun EmptyLine(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun PhoneLine(phone: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier.clickable(onClick = onClick),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Default.Phone,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Text(
            text = formatPhoneForDisplay(phone),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

private enum class StatusTone { POSITIVE, WARNING, NEGATIVE, NEUTRAL }

@Composable
private fun StatusTone.color(): Color = when (this) {
    StatusTone.POSITIVE -> AppColors.StatusDone
    StatusTone.WARNING -> AppColors.StatusInProgress
    StatusTone.NEGATIVE -> MaterialTheme.colorScheme.error
    StatusTone.NEUTRAL -> MaterialTheme.colorScheme.onSurfaceVariant
}

@Composable
private fun StatusChip(label: String, tone: StatusTone) {
    val base = tone.color()
    Box(
        modifier = Modifier
            .background(base.copy(alpha = 0.14f), AppShape.sm)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = base,
        )
    }
}

// ---------------------------------------------------------------------------
// Действия и словари лейблов (паритет с порталом)
// ---------------------------------------------------------------------------

/**
 * Подстрока под адресом: только город, и только если его нет в самом адресе —
 * улица/дом/корпус и так в заголовке, повторять их незачем.
 */
private fun cityHint(address: String, city: String?): String =
    city?.takeIf { it.isNotBlank() && !address.contains(it, ignoreCase = true) }.orEmpty()

private fun dial(context: android.content.Context, phone: String) {
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_DIAL, Uri.parse("tel:${normalizePhoneForDial(phone)}")),
        )
    }
}

private fun mail(context: android.content.Context, email: String) {
    runCatching {
        context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$email")))
    }
}

private fun systemTypeLabel(value: String): String = when (value) {
    "video_surveillance" -> "Видеонаблюдение"
    "intercom" -> "Домофония"
    "fire_protection" -> "АППЗ"
    "access_control" -> "СКД"
    "fire_alarm" -> "ОПС"
    "other" -> "Другое"
    else -> value
}

private fun systemStatusLabel(value: String): String = when (value) {
    "active" -> "Активна"
    "maintenance" -> "На ремонте"
    "disabled" -> "Отключена"
    else -> value
}

private fun systemStatusTone(value: String): StatusTone = when (value) {
    "active" -> StatusTone.POSITIVE
    "maintenance" -> StatusTone.WARNING
    else -> StatusTone.NEUTRAL
}

private fun equipmentTypeLabel(value: String): String = when (value) {
    "camera" -> "Камера"
    "dvr" -> "Видеорегистратор"
    "intercom_panel" -> "Панель вызова"
    "intercom_handset" -> "Трубка домофона"
    "sensor" -> "Датчик"
    "controller" -> "Контроллер"
    "reader" -> "Считыватель"
    "lock" -> "Замок"
    "switch" -> "Коммутатор"
    "router" -> "Роутер"
    "ups" -> "ИБП"
    "other" -> "Другое"
    else -> value
}

private fun equipmentStatusLabel(value: String): String = when (value) {
    "working" -> "Работает"
    "faulty" -> "Неисправно"
    "dismantled" -> "Демонтировано"
    else -> value
}

private fun equipmentStatusTone(value: String): StatusTone = when (value) {
    "working" -> StatusTone.POSITIVE
    "faulty" -> StatusTone.NEGATIVE
    else -> StatusTone.NEUTRAL
}

private fun documentTypeLabel(value: String): String = when (value) {
    "contract" -> "Договор"
    "estimate" -> "Смета"
    "act" -> "Акт"
    "scheme" -> "Схема"
    "passport" -> "Паспорт"
    "other" -> "Другое"
    else -> value
}

private fun contactTypeLabel(value: String): String = when (value) {
    "chairman" -> "Председатель"
    "elder" -> "Старший по дому"
    "management" -> "УК"
    "concierge" -> "Консьерж"
    "other" -> "Другое"
    else -> value
}

private fun historyEventLabel(value: String): String = when (value) {
    "created" -> "Адрес создан"
    "updated" -> "Адрес изменён"
    "system_added" -> "Добавлена система"
    "system_updated" -> "Система изменена"
    "equipment_added" -> "Добавлено оборудование"
    "equipment_updated" -> "Оборудование изменено"
    "contact_added" -> "Добавлен контакт"
    "contact_updated" -> "Контакт изменён"
    "document_added" -> "Добавлен документ"
    "document_removed" -> "Документ удалён"
    "panel_added" -> "Добавлена панель"
    "panel_updated" -> "Панель изменена"
    "assignee_added" -> "Назначен сотрудник"
    "assignee_removed" -> "Сотрудник снят"
    else -> value
}
