package com.fieldworker.ui.list

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.fieldworker.domain.model.User

/** Поиск по исполнителям показываем, только когда список не помещается на экран. */
private const val SEARCH_THRESHOLD = 8

/**
 * Диалог выбора исполнителя заявки (для диспетчера/админа).
 */
@Composable
fun AssigneePickerDialog(
    workers: List<User>,
    currentAssigneeId: Long?,
    isLoading: Boolean,
    isAssigning: Boolean,
    onAssign: (Long?) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val visibleWorkers = remember(workers, query) {
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) workers
        else workers.filter {
            it.getDisplayName().lowercase().contains(needle) ||
                it.username.lowercase().contains(needle)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Исполнитель",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
        },
        text = {
            Column {
                when {
                    isLoading -> Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 2.dp)
                    }
                    workers.isEmpty() -> Text(
                        text = "Нет доступных исполнителей.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium
                    )
                    else -> {
                        if (workers.size > SEARCH_THRESHOLD) {
                            OutlinedTextField(
                                value = query,
                                onValueChange = { query = it },
                                placeholder = { Text("Поиск") },
                                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                textStyle = MaterialTheme.typography.bodyMedium
                            )
                            Spacer(modifier = Modifier.padding(top = 8.dp))
                        }
                        LazyColumn(modifier = Modifier.heightIn(max = 360.dp)) {
                            items(visibleWorkers, key = { it.id }) { worker ->
                                AssigneeRow(
                                    worker = worker,
                                    selected = worker.id == currentAssigneeId,
                                    enabled = !isAssigning,
                                    onClick = { onAssign(worker.id) }
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            if (currentAssigneeId != null) {
                TextButton(onClick = { onAssign(null) }, enabled = !isAssigning) {
                    Text("Снять исполнителя", color = MaterialTheme.colorScheme.error)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Закрыть")
            }
        }
    )
}

@Composable
private fun AssigneeRow(
    worker: User,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled && !selected, onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = worker.getDisplayName(),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = worker.getRoleDisplayName(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        if (selected) {
            Spacer(modifier = Modifier.width(8.dp))
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = "Текущий исполнитель",
                tint = MaterialTheme.colorScheme.primary
            )
        }
    }
}

/**
 * Состояние и действия назначения исполнителя для экранов со списком заявок.
 * null на экране означает, что у пользователя нет права assign_tasks.
 */
class TaskAssignmentUi(
    val showDialog: Boolean,
    val workers: List<User>,
    val isLoadingWorkers: Boolean,
    val isAssigning: Boolean,
    val onOpen: () -> Unit,
    val onDismiss: () -> Unit,
    val onAssign: (taskId: Long, userId: Long?) -> Unit,
)
