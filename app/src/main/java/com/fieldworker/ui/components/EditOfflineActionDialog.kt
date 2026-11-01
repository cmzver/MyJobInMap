package com.fieldworker.ui.components

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.unit.dp
import com.fieldworker.domain.model.FailedAction
import com.fieldworker.domain.model.OfflineChangeKind
import com.fieldworker.domain.model.TaskStatus
import java.time.LocalDate

@Composable
internal fun EditOfflineActionDialog(
    action: FailedAction,
    onDismiss: () -> Unit,
    onSave: (String, String) -> Unit,
) {
    var value by remember(action.id) { mutableStateOf(action.editValue) }
    var comment by remember(action.id) { mutableStateOf(action.editComment) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Исправить изменение") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(action.taskLabel, style = MaterialTheme.typography.bodySmall)
                action.serverState?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                if (action.editKind == OfflineChangeKind.STATUS) {
                    TaskStatus.entries.forEach { status ->
                        TextButton(onClick = { value = status.name }) {
                            Text((if (value == status.name) "✓ " else "") + status.displayName)
                        }
                    }
                    OutlinedTextField(value = comment, onValueChange = { comment = it.take(1000) }, label = { Text("Комментарий") })
                } else {
                    OutlinedTextField(value = value, onValueChange = { value = it.take(1000) },
                        label = { Text(if (action.editKind == OfflineChangeKind.PLANNED_DATE) "Дата ГГГГ-ММ-ДД (пусто — снять)" else "Комментарий") })
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                error = when {
                    action.editKind == OfflineChangeKind.STATUS && value in listOf("DONE", "CANCELLED") && comment.isBlank() -> "Добавьте комментарий"
                    action.editKind == OfflineChangeKind.COMMENT && value.isBlank() -> "Введите комментарий"
                    action.editKind == OfflineChangeKind.PLANNED_DATE && value.isNotBlank() && runCatching { LocalDate.parse(value) }.isFailure -> "Укажите дату в формате ГГГГ-ММ-ДД"
                    else -> null
                }
                if (error == null) onSave(value, comment)
            }) { Text("Сохранить и отправить") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
    )
}
