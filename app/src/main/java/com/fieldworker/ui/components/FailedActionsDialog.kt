package com.fieldworker.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
) {
    // Отмена уничтожает офлайн-правку — подтверждаем вторым нажатием
    var confirmDiscardId by remember { mutableStateOf<Long?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Не отправлено",
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
                            color = MaterialTheme.colorScheme.error
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End
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
                            TextButton(onClick = { onRetry(action.id) }) {
                                Text("Повторить")
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
