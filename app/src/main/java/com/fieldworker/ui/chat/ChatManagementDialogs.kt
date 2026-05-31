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
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import com.fieldworker.domain.model.ConversationType
import com.fieldworker.domain.model.User
import com.fieldworker.ui.chat.components.ChatAvatar

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
        containerColor = MaterialTheme.colorScheme.surface,
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
                    SoftTextField(
                        value = groupName,
                        onValueChange = { groupName = it },
                        placeholder = "Название группы",
                        enabled = !isSubmitting,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                SoftTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = "Поиск",
                    enabled = !isSubmitting,
                    leadingIcon = Icons.Default.Search,
                    modifier = Modifier.fillMaxWidth(),
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

                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
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
        containerColor = MaterialTheme.colorScheme.surface,
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
                        SoftTextField(
                            value = groupName,
                            onValueChange = { groupName = it },
                            placeholder = "Название группы",
                            enabled = !isSavingConversation,
                            modifier = Modifier.weight(1f),
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

                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
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
                }

                if (canManageOthers) {
                    HorizontalDivider()
                    Text(
                        text = "Добавить участников",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )

                    SoftTextField(
                        value = memberSearchQuery,
                        onValueChange = { memberSearchQuery = it },
                        placeholder = "Поиск",
                        enabled = !isSavingConversation,
                        leadingIcon = Icons.Default.Search,
                        modifier = Modifier.fillMaxWidth(),
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
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
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
    val containerColor by animateColorAsState(
        targetValue = if (selected) {
            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)
        } else {
            Color.Transparent
        },
        label = "selectableRowBackground",
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(containerColor)
            .toggleable(
                value = selected,
                enabled = enabled,
                role = Role.Checkbox,
                onValueChange = { onClick() },
            )
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ChatAvatar(
            name = user.getDisplayName(),
            id = user.id,
            type = ConversationType.DIRECT,
            size = 42,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = user.getDisplayName(),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
            )
            Text(
                text = "@${user.username}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
        SelectionIndicator(selected = selected)
    }
}

@Composable
private fun SelectionIndicator(selected: Boolean) {
    if (selected) {
        Box(
            modifier = Modifier
                .size(24.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(15.dp),
            )
        }
    } else {
        Box(
            modifier = Modifier
                .size(24.dp)
                .clip(CircleShape)
                .border(
                    width = 1.5.dp,
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
                    shape = CircleShape,
                ),
        )
    }
}

@Composable
private fun SoftTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
) {
    val fill = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
    TextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = {
            Text(placeholder, style = MaterialTheme.typography.bodyMedium)
        },
        leadingIcon = leadingIcon?.let { icon ->
            {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        singleLine = true,
        enabled = enabled,
        shape = RoundedCornerShape(14.dp),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = fill,
            unfocusedContainerColor = fill,
            disabledContainerColor = fill.copy(alpha = 0.3f),
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            disabledIndicatorColor = Color.Transparent,
        ),
        modifier = modifier,
    )
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
    var menuOpen by remember { mutableStateOf(false) }
    val isSelf = member.userId == currentUserId
    val canRemove = isSelf || canManageOthers
    val canToggleRole = canManageOthers && !isSelf && member.role != "owner"
    val canTransfer = canTransferOwnership && !isSelf && member.role != "owner"
    val hasActions = canRemove || canToggleRole || canTransfer

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ChatAvatar(
            name = member.fullName.ifBlank { member.username },
            id = member.userId,
            type = ConversationType.DIRECT,
            size = 42,
        )
        Column(modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = member.fullName.ifBlank { member.username },
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                )
                if (member.role == "owner" || member.role == "admin") {
                    RolePill(role = member.role)
                }
            }
            Text(
                text = if (isSelf) "@${member.username} · вы" else "@${member.username}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
        if (hasActions) {
            Box {
                IconButton(onClick = { menuOpen = true }, enabled = !isBusy) {
                    Icon(
                        imageVector = Icons.Default.MoreVert,
                        contentDescription = "Действия с участником",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                DropdownMenu(
                    expanded = menuOpen,
                    onDismissRequest = { menuOpen = false },
                ) {
                    if (canTransfer) {
                        DropdownMenuItem(
                            text = { Text("Сделать владельцем") },
                            onClick = {
                                menuOpen = false
                                onTransferOwnership()
                            },
                        )
                    }
                    if (canToggleRole) {
                        DropdownMenuItem(
                            text = {
                                Text(
                                    if (member.role == "admin") "Снять администратора" else "Сделать администратором"
                                )
                            },
                            onClick = {
                                menuOpen = false
                                onToggleRole()
                            },
                        )
                    }
                    if (canRemove) {
                        DropdownMenuItem(
                            text = { Text(if (isSelf) "Выйти из группы" else "Удалить из группы") },
                            onClick = {
                                menuOpen = false
                                onRemove()
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RolePill(role: String) {
    val isOwner = role == "owner"
    val background = if (isOwner) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.secondaryContainer
    }
    val foreground = if (isOwner) {
        MaterialTheme.colorScheme.onPrimaryContainer
    } else {
        MaterialTheme.colorScheme.onSecondaryContainer
    }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(background)
            .padding(horizontal = 6.dp, vertical = 1.dp),
    ) {
        Text(
            text = if (isOwner) "владелец" else "админ",
            style = MaterialTheme.typography.labelSmall,
            color = foreground,
        )
    }
}

private fun memberRoleLabel(role: String): String = when (role) {
    "owner" -> "Owner"
    "admin" -> "Администратор"
    else -> "Участник"
}