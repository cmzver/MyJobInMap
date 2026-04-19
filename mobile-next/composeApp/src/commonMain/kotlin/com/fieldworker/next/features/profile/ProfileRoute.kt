package com.fieldworker.next.features.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fieldworker.next.core.designsystem.FwAvatar
import com.fieldworker.next.core.designsystem.AvatarSize
import com.fieldworker.next.core.designsystem.FwButton
import com.fieldworker.next.core.designsystem.FwButtonStyle
import com.fieldworker.next.core.designsystem.FwCard
import com.fieldworker.next.core.designsystem.FwTheme
import com.fieldworker.next.domain.model.UserRole
import com.fieldworker.next.features.settings.AboutRoute
import com.fieldworker.next.features.settings.AppearanceRoute
import com.fieldworker.next.features.settings.ThemeManager
import com.fieldworker.next.features.settings.ThemeMode
import org.koin.compose.koinInject
import org.koin.compose.viewmodel.koinViewModel

private enum class ProfileSubScreen { APPEARANCE, ABOUT }

@Composable
fun ProfileRoute(
    viewModel: ProfileViewModel = koinViewModel(),
) {
    val session by viewModel.session.collectAsState()
    var subScreen by remember { mutableStateOf<ProfileSubScreen?>(null) }
    val themeManager = koinInject<ThemeManager>()
    val themeMode by themeManager.themeMode.collectAsState()

    subScreen?.let { screen ->
        when (screen) {
            ProfileSubScreen.APPEARANCE -> AppearanceRoute(
                currentTheme = themeMode,
                onThemeSelected = { themeManager.setTheme(it) },
                onBack = { subScreen = null },
            )
            ProfileSubScreen.ABOUT -> AboutRoute(
                onBack = { subScreen = null },
            )
        }
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp),
    ) {
        Text(
            text = "Профиль",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(20.dp))

        // User card
        FwCard {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                FwAvatar(
                    name = session.fullName,
                    size = AvatarSize.Large,
                )
                Column {
                    Text(
                        text = session.fullName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    session.role?.let { role ->
                        Text(
                            text = role.label(),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    session.organizationName?.let { org ->
                        Text(
                            text = org,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        // Server info
        FwCard {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                session.environment?.let { env ->
                    ProfileInfoRow(label = "Сервер", value = env.label)
                    HorizontalDivider(color = FwTheme.extended.divider)
                    ProfileInfoRow(label = "URL", value = env.baseUrl)
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        // Settings section
        FwCard(contentPadding = 0.dp) {
            Column {
                SettingsRow(
                    icon = Icons.Rounded.Notifications,
                    title = "Уведомления",
                    onClick = { /* TODO */ },
                )
                HorizontalDivider(
                    color = FwTheme.extended.divider,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                SettingsRow(
                    icon = Icons.Rounded.DarkMode,
                    title = "Оформление",
                    onClick = { subScreen = ProfileSubScreen.APPEARANCE },
                )
                HorizontalDivider(
                    color = FwTheme.extended.divider,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                SettingsRow(
                    icon = Icons.Rounded.Info,
                    title = "О приложении",
                    subtitle = "v0.1.0",
                    onClick = { subScreen = ProfileSubScreen.ABOUT },
                )
            }
        }

        Spacer(Modifier.weight(1f))
        Spacer(Modifier.height(20.dp))

        FwButton(
            text = "Выйти",
            onClick = viewModel::signOut,
            style = FwButtonStyle.Destructive,
            modifier = Modifier.fillMaxWidth(),
            leadingIcon = {
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.Logout,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
            },
        )

        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun ProfileInfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun SettingsRow(
    icon: ImageVector,
    title: String,
    subtitle: String? = null,
    onClick: () -> Unit = {},
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(22.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            subtitle?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Icon(
            imageVector = Icons.Rounded.ChevronRight,
            contentDescription = null,
            modifier = Modifier.size(20.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
        )
    }
}

private fun UserRole.label(): String = when (this) {
    UserRole.WORKER -> "Исполнитель"
    UserRole.DISPATCHER -> "Диспетчер"
    UserRole.ADMIN -> "Администратор"
}
