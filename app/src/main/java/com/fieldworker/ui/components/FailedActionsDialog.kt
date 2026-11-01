package com.fieldworker.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fieldworker.domain.model.FailedAction

/**
 * Разбор офлайн-действий, которые очередь не смогла отправить: повторить или
 * отменить локальное изменение (заявка вернётся к серверному состоянию).
 */
@Composable
fun FailedActionsDialog(
    actions: List<FailedAction>,
    onRetry: (Long) -> Unit,
    onDiscard: (Long) -> Unit,
    onDismiss: () -> Unit,
    onEdit: (Long, String, String) -> Unit = { _, _, _ -> },
) {
    var editing by remember { mutableStateOf<FailedAction?>(null) }
    editing?.let { action ->
        EditOfflineActionDialog(action = action, onDismiss = { editing = null }, onSave = { value, comment ->
            editing = null; onEdit(action.id, value, comment)
        })
        return
    }
    // Отмена уничтожает офлайн-правку — подтверждаем вторым нажатием
    var confirmRetryId by remember { mutableStateOf<Long?>(null) }
    var confirmDiscardId by remember { mutableStateOf<Long?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Синхронизация",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
        },
        text = {
            LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
                items(actions, key = { it.id }) { action ->
                    Column(
                        modifier = Modifier.padding(vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        Text(
                            text = action.taskLabel,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = action.description,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = action.reason,
                            style = MaterialTheme.typography.bodySmall,
                            color = if (action.isFailed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        action.serverState?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.End
                        ) {
                            val confirming = confirmDiscardId == action.id
                            TextButton(
                                onClick = {
                                    if (confirming) {
                                        confirmDiscardId = null
                                        onDiscard(action.id)
                                    } else {
                                        confirmDiscardId = action.id
                                    }
                                }
                            ) {
                                Text(
                                    text = if (confirming) "Точно отменить?" else "Отменить изменение",
                                    color = MaterialTheme.colorScheme.error
                                )
                            }
                            if (action.editKind != null) TextButton(onClick = { editing = action }) { Text("Исправить") }
                            if (action.isFailed) TextButton(onClick = {
                                if (action.isConflict && confirmRetryId != action.id) confirmRetryId = action.id
                                else { confirmRetryId = null; onRetry(action.id) }
                            }) {
                                Text(if (action.isConflict) {
                                    if (confirmRetryId == action.id) "Подтвердить моё изменение" else "Сохранить моё"
                                } else "Повторить")
                            }
                        }
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Закрыть") }
        }
    )
}
