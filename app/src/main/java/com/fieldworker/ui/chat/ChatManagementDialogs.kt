package com.fieldworker.ui.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Checkbox
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fieldworker.domain.model.ConversationDetail
import com.fieldworker.domain.model.ConversationMember
import com.fieldworker.domain.model.User

private data class PendingRoleChange(
    val member: ConversationMember,
    val nextRole: String,
)

private enum class NewConversationMode {
    DIRECT,
    GROUP,
}

@Composable
fun NewConversationDialog(
    currentUserId: Long,
    users: List<User>,
    isLoadingUsers: Boolean,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onRefreshUsers: () -> Unit,
    onCreateDirect: (Long) -> Unit,
    onCreateGroup: (String, List<Long>) -> Unit,
) {
    var mode by remember { mutableStateOf(NewConversationMode.DIRECT) }
    var groupName by remember { mutableStateOf("") }
    var searchQuery by remember { mutableStateOf("") }
    var selectedDirectUserId by remember { mutableStateOf<Long?>(null) }
    var selectedGroupUserIds by remember { mutableStateOf(setOf<Long>()) }

    val availableUsers = remember(users, currentUserId, searchQuery) {
        users
            .filter { it.id != currentUserId }
            .filter {
                searchQuery.isBlank() ||
                    it.getDisplayName().contains(searchQuery, ignoreCase = true) ||
                    it.username.contains(searchQuery, ignoreCase = true)
            }
    }

    AlertDialog(
        onDismissRequest = {
            if (!isSubmitting) onDismiss()
        },
        title = { Text("Новый чат") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(0.85f)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = mode == NewConversationMode.DIRECT,
                        onClick = { mode = NewConversationMode.DIRECT },
                        label = { Text("Личный") },
                    )
                    FilterChip(
                        selected = mode == NewConversationMode.GROUP,
                        onClick = { mode = NewConversationMode.GROUP },
                        label = { Text("Группа") },
                    )
                }

                if (mode == NewConversationMode.GROUP) {
                    OutlinedTextField(
                        value = groupName,
                        onValueChange = { groupName = it },
                        label = { Text("Название группы") },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !isSubmitting,
                        singleLine = true,
                    )
                }

                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    label = { Text("Поиск пользователей") },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isSubmitting,
                    singleLine = true,
                )

                when {
                    isLoadingUsers -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 24.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(28.dp))
                        }
                    }

                    availableUsers.isEmpty() -> {
                        Text(
                            text = "Нет доступных пользователей",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        TextButton(onClick = onRefreshUsers, enabled = !isSubmitting) {
                            Text("Обновить список")
                        }
                    }

                    else -> {
                        if (mode == NewConversationMode.GROUP && selectedGroupUserIds.isNotEmpty()) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                selectedGroupUserIds.take(3).forEach { userId ->
                                    val user = users.firstOrNull { it.id == userId } ?: return@forEach
                                    AssistChip(
                                        onClick = {},
                                        enabled = false,
                                        label = { Text(user.getDisplayName()) },
                                    )
                                }
                                if (selectedGroupUserIds.size > 3) {
                                    Text(
                                        text = "+${selectedGroupUserIds.size - 3}",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }

                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            availableUsers.forEach { user ->
                                SelectableUserRow(
                                    user = user,
                                    selected = if (mode == NewConversationMode.DIRECT) {
                                        selectedDirectUserId == user.id
                                    } else {
                                        selectedGroupUserIds.contains(user.id)
                                    },
                                    enabled = !isSubmitting,
                                    onClick = {
                                        if (mode == NewConversationMode.DIRECT) {
                                            selectedDirectUserId = user.id
                                        } else {
                                            selectedGroupUserIds = if (selectedGroupUserIds.contains(user.id)) {
                                                selectedGroupUserIds - user.id
                                            } else {
                                                selectedGroupUserIds + user.id
                                            }
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (mode == NewConversationMode.DIRECT) {
                        selectedDirectUserId?.let(onCreateDirect)
                    } else {
                        onCreateGroup(groupName, selectedGroupUserIds.toList())
                    }
                },
                enabled = !isSubmitting && if (mode == NewConversationMode.DIRECT) {
                    selectedDirectUserId != null
                } else {
                    groupName.isNotBlank() && selectedGroupUserIds.isNotEmpty()
                },
            ) {
                Text(if (mode == NewConversationMode.DIRECT) "Открыть чат" else "Создать группу")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) {
                Text("Отмена")
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupManagementDialog(
    conversationDetail: ConversationDetail,
    currentUserId: Long,
    users: List<User>,
    isLoadingUsers: Boolean,
    isSavingConversation: Boolean,
    activeManagementUserId: Long?,
    onDismiss: () -> Unit,
    onRefreshUsers: () -> Unit,
    onRenameConversation: (String) -> Unit,
    onAddMembers: (List<Long>) -> Unit,
    onRemoveMember: (Long) -> Unit,
    onUpdateMemberRole: (Long, String) -> Unit,
    onTransferOwnership: (Long) -> Unit,
) {
    val currentMember = conversationDetail.members.firstOrNull { it.userId == currentUserId }
    val canManageOthers = currentMember?.role == "owner" || currentMember?.role == "admin"
    val canTransferOwnership = currentMember?.role == "owner" && conversationDetail.members.size > 1
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var groupName by remember(conversationDetail.id, conversationDetail.name, conversationDetail.displayName) {
        mutableStateOf(conversationDetail.name ?: conversationDetail.displayName.orEmpty())
    }
    var selectedUserIds by remember(conversationDetail.id) { mutableStateOf(setOf<Long>()) }
    var memberSearchQuery by remember(conversationDetail.id) { mutableStateOf("") }
    var pendingRemovalMember by remember(conversationDetail.id) { mutableStateOf<ConversationMember?>(null) }
    var pendingOwnershipMember by remember(conversationDetail.id) { mutableStateOf<ConversationMember?>(null) }
    var pendingRoleChange by remember(conversationDetail.id) { mutableStateOf<PendingRoleChange?>(null) }

    val candidateUsers = remember(conversationDetail.members, users, currentUserId, memberSearchQuery) {
        val existingIds = conversationDetail.members.map { it.userId }.toSet()
        users
            .filter { it.id != currentUserId && it.id !in existingIds }
            .filter {
                memberSearchQuery.isBlank() ||
                    it.getDisplayName().contains(memberSearchQuery, ignoreCase = true) ||
                    it.username.contains(memberSearchQuery, ignoreCase = true)
            }
    }

    ModalBottomSheet(
        onDismissRequest = {
            if (!isSavingConversation && activeManagementUserId == null) onDismiss()
        },
        sheetState = sheetState,
        dragHandle = null,
        contentWindowInsets = { WindowInsets(0, 0, 0, 0) },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .fillMaxHeight(0.92f),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Управление группой",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Переименование, состав и роли участников",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                TextButton(
                    onClick = onDismiss,
                    enabled = !isSavingConversation && activeManagementUserId == null,
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Закрыть")
                }
            }

            HorizontalDivider()

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (canManageOthers) {
                    Text(
                        text = "Название",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedTextField(
                            value = groupName,
                            onValueChange = { groupName = it },
                            label = { Text("Название группы") },
                            modifier = Modifier.weight(1f),
                            enabled = !isSavingConversation,
                            singleLine = true,
                        )
                        Button(
                            onClick = { onRenameConversation(groupName.trim()) },
                            enabled = !isSavingConversation && groupName.isNotBlank(),
                        ) {
                            Text("Сохранить")
                        }
                    }
                    Text(
                        text = "Название видно всем участникам группы.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    HorizontalDivider()
                }

                Text(
                    text = "Участники",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )

                conversationDetail.members.forEach { member ->
                    MemberManagementRow(
                        member = member,
                        currentUserId = currentUserId,
                        canManageOthers = canManageOthers,
                        canTransferOwnership = canTransferOwnership,
                        isBusy = isSavingConversation || activeManagementUserId == member.userId,
                        onToggleRole = {
                            val nextRole = if (member.role == "admin") "member" else "admin"
                            pendingRoleChange = PendingRoleChange(member = member, nextRole = nextRole)
                        },
                        onTransferOwnership = { pendingOwnershipMember = member },
                        onRemove = { pendingRemovalMember = member },
                    )
                }

                if (canManageOthers) {
                    HorizontalDivider()
                    Text(
                        text = "Добавить участников",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )

                    OutlinedTextField(
                        value = memberSearchQuery,
                        onValueChange = { memberSearchQuery = it },
                        label = { Text("Поиск по пользователям") },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !isSavingConversation,
                        singleLine = true,
                    )

                    if (selectedUserIds.isNotEmpty()) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            selectedUserIds.take(3).forEach { userId ->
                                val user = users.firstOrNull { it.id == userId } ?: return@forEach
                                AssistChip(
                                    onClick = {},
                                    enabled = false,
                                    label = { Text(user.getDisplayName()) },
                                )
                            }
                            if (selectedUserIds.size > 3) {
                                Text(
                                    text = "+${selectedUserIds.size - 3}",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }

                    when {
                        isLoadingUsers -> {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 16.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(24.dp))
                            }
                        }

                        candidateUsers.isEmpty() -> {
                            Text(
                                text = if (memberSearchQuery.isBlank()) {
                                    "Нет доступных пользователей для добавления"
                                } else {
                                    "Никто не найден по текущему запросу"
                                },
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            TextButton(onClick = onRefreshUsers, enabled = !isSavingConversation) {
                                Text("Обновить список")
                            }
                        }

                        else -> {
                            candidateUsers.forEach { user ->
                                SelectableUserRow(
                                    user = user,
                                    selected = selectedUserIds.contains(user.id),
                                    enabled = !isSavingConversation,
                                    onClick = {
                                        selectedUserIds = if (selectedUserIds.contains(user.id)) {
                                            selectedUserIds - user.id
                                        } else {
                                            selectedUserIds + user.id
                                        }
                                    },
                                )
                            }

                            Button(
                                onClick = {
                                    onAddMembers(selectedUserIds.toList())
                                    selectedUserIds = emptySet()
                                    memberSearchQuery = ""
                                },
                                enabled = !isSavingConversation && selectedUserIds.isNotEmpty(),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Добавить выбранных")
                            }
                        }
                    }
                }
            }
        }
    }

    pendingRemovalMember?.let { member ->
        AlertDialog(
            onDismissRequest = { pendingRemovalMember = null },
            title = { Text(if (member.userId == currentUserId) "Выйти из группы" else "Удалить участника") },
            text = {
                Text(
                    if (member.userId == currentUserId) {
                        "Вы выйдете из этой группы и потеряете доступ к её истории, если вас не добавят снова."
                    } else {
                        "Участник ${member.fullName.ifBlank { member.username }} будет удалён из группы."
                    }
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        pendingRemovalMember = null
                        onRemoveMember(member.userId)
                    },
                    enabled = !isSavingConversation && activeManagementUserId == null,
                ) {
                    Text(if (member.userId == currentUserId) "Выйти" else "Удалить")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingRemovalMember = null }) {
                    Text("Отмена")
                }
            },
        )
    }

    pendingOwnershipMember?.let { member ->
        AlertDialog(
            onDismissRequest = { pendingOwnershipMember = null },
            title = { Text("Передать ownership") },
            text = {
                Text(
                    "После подтверждения ${member.fullName.ifBlank { member.username }} станет owner, а вы получите роль admin."
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        pendingOwnershipMember = null
                        onTransferOwnership(member.userId)
                    },
                    enabled = !isSavingConversation && activeManagementUserId == null,
                ) {
                    Text("Передать")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingOwnershipMember = null }) {
                    Text("Отмена")
                }
            },
        )
    }

    pendingRoleChange?.let { change ->
        val member = change.member
        val nextRoleLabel = memberRoleLabel(change.nextRole)
        AlertDialog(
            onDismissRequest = { pendingRoleChange = null },
            title = { Text("Изменить роль") },
            text = {
                Text(
                    "Пользователь ${member.fullName.ifBlank { member.username }} получит роль $nextRoleLabel."
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        pendingRoleChange = null
                        onUpdateMemberRole(member.userId, change.nextRole)
                    },
                    enabled = !isSavingConversation && activeManagementUserId == null,
                ) {
                    Text("Подтвердить")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingRoleChange = null }) {
                    Text("Отмена")
                }
            },
        )
    }
}

@Composable
private fun SelectableUserRow(
    user: User,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        tonalElevation = if (selected) 2.dp else 0.dp,
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .toggleable(
                    value = selected,
                    enabled = enabled,
                    onValueChange = { onClick() },
                )
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Checkbox(checked = selected, onCheckedChange = null, enabled = enabled)
            Column(modifier = Modifier.weight(1f)) {
                Text(user.getDisplayName(), style = MaterialTheme.typography.bodyMedium)
                Text(
                    text = "@${user.username}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun MemberManagementRow(
    member: ConversationMember,
    currentUserId: Long,
    canManageOthers: Boolean,
    canTransferOwnership: Boolean,
    isBusy: Boolean,
    onToggleRole: () -> Unit,
    onTransferOwnership: () -> Unit,
    onRemove: () -> Unit,
) {
    val roleLabel = memberRoleLabel(member.role)
    val roleColors = when (member.role) {
        "owner" -> AssistChipDefaults.assistChipColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            labelColor = MaterialTheme.colorScheme.onPrimaryContainer,
        )
        "admin" -> AssistChipDefaults.assistChipColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            labelColor = MaterialTheme.colorScheme.onSecondaryContainer,
        )
        else -> AssistChipDefaults.assistChipColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
            labelColor = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        tonalElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = member.fullName.ifBlank { member.username },
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = "@${member.username}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AssistChip(
                        onClick = {},
                        enabled = false,
                        label = { Text(roleLabel) },
                        colors = roleColors,
                    )
                    if (member.userId == currentUserId) {
                        AssistChip(
                            onClick = {},
                            enabled = false,
                            label = { Text("Вы") },
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (canTransferOwnership && member.userId != currentUserId && member.role != "owner") {
                    TextButton(onClick = onTransferOwnership, enabled = !isBusy) {
                        Text("Сделать owner")
                    }
                }

                if (canManageOthers && member.userId != currentUserId && member.role != "owner") {
                    TextButton(onClick = onToggleRole, enabled = !isBusy) {
                        Text(if (member.role == "admin") "Сделать участником" else "Сделать admin")
                    }
                }

                if (member.userId == currentUserId || canManageOthers) {
                    TextButton(onClick = onRemove, enabled = !isBusy) {
                        Text(if (member.userId == currentUserId) "Выйти" else "Удалить")
                    }
                }
            }
        }
    }
}

private fun memberRoleLabel(role: String): String = when (role) {
    "owner" -> "Owner"
    "admin" -> "Администратор"
    else -> "Участник"
}