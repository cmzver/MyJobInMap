package com.fieldworker.ui.settings

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TextButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import coil.request.ImageRequest

/**
 * Настройки пользователя: имя, аватар, смена пароля.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserSettingsScreen(
    baseUrl: String?,
    authToken: String?,
    onBack: () -> Unit,
    viewModel: UserSettingsViewModel = hiltViewModel(),
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

    val avatarPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
        onResult = { uri: Uri? -> uri?.let(viewModel::uploadAvatar) }
    )

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Профиль") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(16.dp))

            AvatarBlock(
                avatarUrl = state.avatarUrl,
                fullName = state.fullName,
                baseUrl = baseUrl,
                authToken = authToken,
                isUploading = state.isUploadingAvatar,
                onPick = {
                    avatarPickerLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    )
                },
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = state.username.ifBlank { "—" },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(24.dp))
            HorizontalDivider(Modifier.padding(horizontal = 20.dp))

            NameSection(
                currentName = state.fullName,
                isSaving = state.isSavingName,
                onSave = viewModel::saveName,
            )

            HorizontalDivider(Modifier.padding(horizontal = 20.dp))

            PasswordSection(
                isChanging = state.isChangingPassword,
                onChange = viewModel::changePassword,
            )

            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun AvatarBlock(
    avatarUrl: String?,
    fullName: String,
    baseUrl: String?,
    authToken: String?,
    isUploading: Boolean,
    onPick: () -> Unit,
) {
    val context = LocalContext.current
    val resolved = remember(avatarUrl, baseUrl) { resolveUrl(avatarUrl, baseUrl) }
    // Bearer-токен подставляет AuthHeaderInterceptor в общем Coil ImageLoader.
    val imageRequest = remember(resolved) {
        resolved?.let { url ->
            ImageRequest.Builder(context)
                .data(url)
                .crossfade(true)
                .build()
        }
    }

    Box(
        modifier = Modifier
            .size(120.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primaryContainer)
            .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape)
            .clickable(enabled = !isUploading, onClick = onPick),
        contentAlignment = Alignment.Center,
    ) {
        if (imageRequest != null) {
            AsyncImage(
                model = imageRequest,
                contentDescription = "Аватар",
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
        } else {
            val initials = remember(fullName) { initialsOf(fullName) }
            if (initials.isNotEmpty()) {
                Text(
                    text = initials,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 40.sp,
                )
            } else {
                Icon(
                    Icons.Default.Person,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(56.dp),
                )
            }
        }

        if (isUploading) {
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .background(Color.Black.copy(alpha = 0.4f)),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp)
            }
        } else {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary)
                    .border(2.dp, MaterialTheme.colorScheme.background, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Default.Edit,
                    contentDescription = "Изменить",
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun NameSection(
    currentName: String,
    isSaving: Boolean,
    onSave: (String) -> Unit,
) {
    var draft by remember(currentName) { mutableStateOf(currentName) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "Имя",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
        )
        OutlinedTextField(
            value = draft,
            onValueChange = { draft = it },
            label = { Text("Полное имя") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            enabled = !isSaving,
        )
        Button(
            onClick = { onSave(draft) },
            enabled = !isSaving && draft.trim().isNotEmpty() && draft.trim() != currentName,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (isSaving) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
            }
            Text("Сохранить имя")
        }
    }
}

@Composable
private fun PasswordSection(
    isChanging: Boolean,
    onChange: (current: String, new: String, confirm: String, onSuccess: () -> Unit) -> Unit,
) {
    var current by remember { mutableStateOf("") }
    var newPwd by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var showCurrent by remember { mutableStateOf(false) }
    var showNew by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "Пароль",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
        )
        PasswordField(
            value = current,
            onChange = { current = it },
            label = "Текущий пароль",
            visible = showCurrent,
            onToggleVisible = { showCurrent = !showCurrent },
            enabled = !isChanging,
        )
        PasswordField(
            value = newPwd,
            onChange = { newPwd = it },
            label = "Новый пароль",
            visible = showNew,
            onToggleVisible = { showNew = !showNew },
            enabled = !isChanging,
        )
        PasswordField(
            value = confirm,
            onChange = { confirm = it },
            label = "Повторите новый пароль",
            visible = showNew,
            onToggleVisible = { showNew = !showNew },
            enabled = !isChanging,
        )
        Text(
            text = "Минимум 6 символов",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Start,
        )
        Button(
            onClick = {
                onChange(current, newPwd, confirm) {
                    current = ""
                    newPwd = ""
                    confirm = ""
                }
            },
            enabled = !isChanging && current.isNotBlank() && newPwd.isNotBlank() && confirm.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (isChanging) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
            }
            Text("Сменить пароль")
        }
    }
}

@Composable
private fun PasswordField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    visible: Boolean,
    onToggleVisible: () -> Unit,
    enabled: Boolean,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        enabled = enabled,
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = {
            TextButton(onClick = onToggleVisible) {
                Text(if (visible) "Скрыть" else "Показать")
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )
}

private fun resolveUrl(avatarUrl: String?, baseUrl: String?): String? {
    val a = avatarUrl?.trim().takeUnless { it.isNullOrBlank() } ?: return null
    if (a.startsWith("http://") || a.startsWith("https://")) return a
    val b = baseUrl?.trimEnd('/').takeUnless { it.isNullOrBlank() } ?: return null
    return b + (if (a.startsWith("/")) a else "/$a")
}

private fun initialsOf(name: String?): String {
    if (name.isNullOrBlank()) return ""
    val parts = name.trim().split(" ", limit = 2)
    return parts.mapNotNull { it.firstOrNull()?.uppercase() }.joinToString("").take(2)
}
