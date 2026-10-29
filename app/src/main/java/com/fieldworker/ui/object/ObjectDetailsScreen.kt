package com.fieldworker.ui.objectcard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fieldworker.domain.model.AddressDetails
import com.fieldworker.domain.model.Comment
import com.fieldworker.domain.model.Priority
import com.fieldworker.domain.model.Task
import com.fieldworker.ui.utils.TaskUtils
import com.fieldworker.ui.utils.containerColor
import com.fieldworker.ui.utils.contentColor
import com.fieldworker.ui.utils.extractAdditionalInfo
import com.fieldworker.ui.utils.formatPhoneForDisplay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ObjectDetailsScreen(
    task: Task?,
    addressDetails: AddressDetails?,
    isLoading: Boolean,
    hasAttemptedLookup: Boolean,
    onBack: () -> Unit,
    onSendToChat: () -> Unit = {},
    comments: List<Comment> = emptyList(),
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
                },
                actions = {
                    if (task != null) {
                        IconButton(onClick = onSendToChat) {
                            Icon(
                                Icons.AutoMirrored.Filled.Send,
                                contentDescription = "Отправить в чат",
                            )
                        }
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

            if (task != null) {
                item { TaskDetailsSection(task = task) }

                if (comments.isNotEmpty()) {
                    item {
                        ObjectInsightList(
                            title = "Комментарии",
                            items = comments.map { comment ->
                                comment.text to listOfNotNull(
                                    comment.author,
                                    TaskUtils.formatShortDate(comment.createdAt),
                                ).filter { it.isNotBlank() }.joinToString(" • ")
                            }
                        )
                    }
                }
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
                                        contact.name to listOfNotNull(contact.position, contact.phone?.let(::formatPhoneForDisplay), contact.email)
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
                            title = "Карточка адреса не найдена",
                            message = "Адрес заявки не найден в адресной базе — показаны данные самой заявки. Проверь адрес или синхронизацию адресной базы."
                        )
                    }

                    task != null -> {
                        // Данные заявки уже показаны выше — адресная карточка не загружена.
                    }

                    else -> {
                        ObjectMessageCard(
                            title = "Нет выбранной заявки",
                            message = "Сначала выберите заявку на карте или в списке, затем откройте карточку."
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
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = addressDetails?.address ?: task?.address ?: "Адрес не определён",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            addressDetails?.city?.takeIf { it.isNotBlank() && !addressDetails.address.contains(it, true) }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            // Заявка, по которой открыта карточка: тот же язык, что в ленте
            task?.let { TaskBadgeRow(it) }
        }
    }
}

@Composable
private fun TaskBadgeRow(task: Task) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(task.status.containerColor())
                .padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(7.dp)
                    .clip(CircleShape)
                    .background(task.status.contentColor())
            )
            Text(
                text = task.status.displayName,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = task.status.contentColor()
            )
        }
        if (task.priority == Priority.EMERGENCY) {
            Text(
                text = "⚠ ${task.priority.displayName}",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = task.priority.contentColor()
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "#${task.getDisplayNumber()}",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun TaskDetailsSection(task: Task) {
    val description = remember(task) { extractAdditionalInfo(task) ?: task.description.trim() }
    val facts = buildList {
        task.customerName?.takeIf { it.isNotBlank() }?.let { add("Заказчик" to it) }
        task.customerPhone?.takeIf { it.isNotBlank() }?.let { add("Телефон" to formatPhoneForDisplay(it)) }
        task.assignedUserName?.takeIf { it.isNotBlank() }?.let { add("Исполнитель" to it) }
        task.plannedDate?.takeIf { it.isNotBlank() }?.let { add("Срок" to TaskUtils.formatShortDate(it)) }
        task.systemType?.takeIf { it.isNotBlank() }?.let { add("Система" to it) }
        task.defectType?.takeIf { it.isNotBlank() }?.let { add("Неисправность" to it) }
    }
    ObjectSectionCard(title = "Заявка") {
        if (description.isNotBlank()) {
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
        if (facts.isNotEmpty()) ObjectFactsGrid(facts)
    }
}

@Composable
private fun ObjectOverviewCard(addressDetails: AddressDetails) {
    val facts = buildList {
        addressDetails.entranceCount?.let { add("Подъезды" to it.toString()) }
        addressDetails.floorCount?.let { add("Этажи" to it.toString()) }
        addressDetails.apartmentCount?.let { add("Квартиры" to it.toString()) }
        addressDetails.entrance?.takeIf { it.isNotBlank() }?.let { add("Подъезд" to it) }
        addressDetails.hasElevator?.let { add("Лифт" to if (it) "есть" else "нет") }
        if (addressDetails.hasIntercom == true) {
            add("Домофон" to (addressDetails.intercomCode?.takeIf { it.isNotBlank() } ?: "есть"))
        }
        addressDetails.managementCompany?.takeIf { it.isNotBlank() }?.let { add("УК" to it) }
        addressDetails.managementPhone?.takeIf { it.isNotBlank() }
            ?.let { add("Телефон УК" to formatPhoneForDisplay(it)) }
    }
    if (facts.isEmpty()) return
    ObjectSectionCard(title = "Объект") {
        ObjectFactsGrid(facts)
    }
}

/** Факты сеткой в две колонки с eyebrow-лейблами — как в карточке заявки. */
@Composable
private fun ObjectFactsGrid(facts: List<Pair<String, String>>) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        facts.chunked(2).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                row.forEach { (label, value) ->
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = label.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            letterSpacing = 0.6.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = value,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
                if (row.size == 1) Spacer(modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun ObjectStatsGrid(addressDetails: AddressDetails) {
    // Четыре равнозначных счётчика — ни один не важнее другого, поэтому
    // раскраска не несёт смысла и только создаёт шум. Один нейтральный тон.
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            ObjectStatCard(
                modifier = Modifier.weight(1f),
                label = "Заявки",
                value = addressDetails.taskStats.total.toString(),
            )
            ObjectStatCard(
                modifier = Modifier.weight(1f),
                label = "Системы",
                value = addressDetails.systems.size.toString(),
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
            )
            ObjectStatCard(
                modifier = Modifier.weight(1f),
                label = "Документы",
                value = addressDetails.documents.size.toString(),
            )
        }
    }
}

@Composable
private fun ObjectStatCard(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
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
