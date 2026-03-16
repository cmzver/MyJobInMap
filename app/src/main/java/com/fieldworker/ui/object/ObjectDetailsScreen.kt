package com.fieldworker.ui.objectcard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fieldworker.domain.model.AddressDetails
import com.fieldworker.domain.model.Task
import com.fieldworker.ui.utils.TaskUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ObjectDetailsScreen(
    task: Task?,
    addressDetails: AddressDetails?,
    isLoading: Boolean,
    hasAttemptedLookup: Boolean,
    onBack: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Карточка объекта",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                    }
                }
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                ObjectHeaderCard(task = task, addressDetails = addressDetails)
            }

            item {
                when {
                    isLoading -> {
                        ObjectMessageCard(
                            title = "Загружаем карточку",
                            message = "Ищем объект в адресной базе и собираем сводку по системам, оборудованию и истории."
                        ) {
                            CircularProgressIndicator(modifier = Modifier.padding(top = 8.dp))
                        }
                    }

                    addressDetails != null -> {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            ObjectOverviewCard(addressDetails = addressDetails)
                            ObjectStatsGrid(addressDetails = addressDetails)

                            if (addressDetails.contacts.isNotEmpty()) {
                                ObjectInsightList(
                                    title = "Контакты",
                                    items = addressDetails.contacts.map { contact ->
                                        contact.name to listOfNotNull(contact.position, contact.phone, contact.email)
                                            .filter { it.isNotBlank() }
                                            .joinToString(" • ")
                                    }
                                )
                            }

                            if (addressDetails.systems.isNotEmpty()) {
                                ObjectInsightList(
                                    title = "Системы",
                                    items = addressDetails.systems.map { system ->
                                        system.name to listOf(system.systemType, system.status.replace('_', ' '))
                                            .filter { it.isNotBlank() }
                                            .joinToString(" • ")
                                    }
                                )
                            }

                            if (addressDetails.equipment.isNotEmpty()) {
                                ObjectInsightList(
                                    title = "Оборудование",
                                    items = addressDetails.equipment.map { equipment ->
                                        equipment.name to listOfNotNull(
                                            equipment.model,
                                            equipment.location,
                                            equipment.status,
                                            equipment.quantity.takeIf { it > 1 }?.let { "x$it" }
                                        ).filter { it.isNotBlank() }.joinToString(" • ")
                                    }
                                )
                            }

                            if (addressDetails.documents.isNotEmpty()) {
                                ObjectInsightList(
                                    title = "Документы",
                                    items = addressDetails.documents.map { document ->
                                        document.name to listOfNotNull(document.docType, document.createdByName)
                                            .filter { it.isNotBlank() }
                                            .joinToString(" • ")
                                    }
                                )
                            }

                            if (addressDetails.history.isNotEmpty()) {
                                ObjectInsightList(
                                    title = "История",
                                    items = addressDetails.history.map { history ->
                                        history.description to listOfNotNull(
                                            history.userName,
                                            TaskUtils.formatShortDate(history.createdAt)
                                        ).filter { it.isNotBlank() }.joinToString(" • ")
                                    }
                                )
                            }

                            if (!addressDetails.notes.isNullOrBlank() || !addressDetails.extraInfo.isNullOrBlank()) {
                                ObjectTextBlockCard(
                                    title = "Заметки",
                                    lines = listOfNotNull(addressDetails.notes, addressDetails.extraInfo)
                                        .filter { it.isNotBlank() }
                                )
                            }
                        }
                    }

                    hasAttemptedLookup -> {
                        ObjectMessageCard(
                            title = "Объект не найден",
                            message = "Для выбранной заявки сервер не нашёл карточку по адресу. Проверь адрес в заявке или синхронизацию адресной базы."
                        )
                    }

                    else -> {
                        ObjectMessageCard(
                            title = "Нет выбранной карточки",
                            message = if (task != null) {
                                "Откройте объект из заявки, чтобы увидеть полную информацию по адресу."
                            } else {
                                "Сначала выберите заявку на карте или в списке, затем откройте карточку объекта."
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ObjectHeaderCard(task: Task?, addressDetails: AddressDetails?) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = MaterialTheme.shapes.large
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = addressDetails?.address ?: task?.address ?: "Адрес не определён",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            task?.let {
                Text(
                    text = "По заявке #${it.getDisplayNumber()} • ${it.title}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun ObjectOverviewCard(addressDetails: AddressDetails) {
    ObjectSectionCard(title = "Сводка") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ObjectInfoRow(
                icon = Icons.Default.Home,
                label = "Адрес",
                value = addressDetails.address
            )

            val buildingFacts = buildList {
                addressDetails.entranceCount?.let { add("подъездов: $it") }
                addressDetails.floorCount?.let { add("этажей: $it") }
                addressDetails.apartmentCount?.let { add("квартир: $it") }
                addressDetails.entrance?.takeIf { it.isNotBlank() }?.let { add("подъезд: $it") }
            }.joinToString(" • ")

            if (buildingFacts.isNotBlank()) {
                ObjectInfoRow(
                    icon = Icons.Default.Home,
                    label = "Параметры здания",
                    value = buildingFacts
                )
            }

            val accessFacts = buildList {
                if (addressDetails.hasElevator == true) add("есть лифт")
                if (addressDetails.hasIntercom == true) {
                    add(
                        addressDetails.intercomCode?.takeIf { it.isNotBlank() }
                            ?.let { "домофон: $it" }
                            ?: "есть домофон"
                    )
                }
            }.joinToString(" • ")

            if (accessFacts.isNotBlank()) {
                ObjectInfoRow(
                    icon = Icons.Default.Lock,
                    label = "Доступ",
                    value = accessFacts
                )
            }

            addressDetails.managementCompany?.takeIf { it.isNotBlank() }?.let {
                ObjectInfoRow(
                    icon = Icons.Default.Info,
                    label = "Управляющая компания",
                    value = it
                )
            }

            addressDetails.managementPhone?.takeIf { it.isNotBlank() }?.let {
                ObjectInfoRow(
                    icon = Icons.Default.Phone,
                    label = "Телефон УК",
                    value = it
                )
            }
        }
    }
}

@Composable
private fun ObjectStatsGrid(addressDetails: AddressDetails) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            ObjectStatCard(
                modifier = Modifier.weight(1f),
                label = "Заявки",
                value = addressDetails.taskStats.total.toString(),
                tint = MaterialTheme.colorScheme.primary
            )
            ObjectStatCard(
                modifier = Modifier.weight(1f),
                label = "Системы",
                value = addressDetails.systems.size.toString(),
                tint = Color(0xFF2F7D4B)
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            ObjectStatCard(
                modifier = Modifier.weight(1f),
                label = "Оборудование",
                value = addressDetails.equipment.sumOf { it.quantity }.toString(),
                tint = Color(0xFFCC7A1A)
            )
            ObjectStatCard(
                modifier = Modifier.weight(1f),
                label = "Документы",
                value = addressDetails.documents.size.toString(),
                tint = Color(0xFF2A6F97)
            )
        }
    }
}

@Composable
private fun ObjectStatCard(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
    tint: Color
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = tint.copy(alpha = 0.10f)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = tint
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun ObjectInsightList(
    title: String,
    items: List<Pair<String, String>>
) {
    ObjectSectionCard(title = title) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items.forEach { (headline, subtitle) ->
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = headline,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    if (subtitle.isNotBlank()) {
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ObjectTextBlockCard(
    title: String,
    lines: List<String>
) {
    ObjectSectionCard(title = title) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            lines.forEach { line ->
                Text(
                    text = line,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

@Composable
private fun ObjectMessageCard(
    title: String,
    message: String,
    trailing: @Composable (() -> Unit)? = null
) {
    ObjectSectionCard(title = title) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            trailing?.let { content -> content() }
        }
    }
}

@Composable
private fun ObjectSectionCard(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = MaterialTheme.shapes.large
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            content(this)
        }
    }
}

@Composable
private fun ObjectInfoRow(
    icon: ImageVector,
    label: String,
    value: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top
    ) {
        Surface(
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
        ) {
            Box(
                modifier = Modifier.padding(10.dp),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
            }
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}
