package com.fieldworker.ui.act

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fieldworker.data.remote.generated.CatalogItemResponse
import com.fieldworker.data.repository.ActSigningResult
import com.fieldworker.domain.model.ActDraft
import com.fieldworker.domain.model.ActLineDraft
import com.fieldworker.domain.model.ActPaymentMethod
import com.fieldworker.domain.model.ActSignerRole
import com.fieldworker.ui.components.SignaturePad
import com.fieldworker.ui.components.SignatureState
import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Locale

private val rub: NumberFormat = NumberFormat.getNumberInstance(Locale.forLanguageTag("ru-RU")).apply {
    minimumFractionDigits = 2
    maximumFractionDigits = 2
}

/** «1 500,00 ₽» — знак рубля не отрывается от суммы при переносе. */
internal fun formatRub(value: BigDecimal): String = "${rub.format(value)}\u00A0₽"

/** Действия шага «Работы»: от ViewModel, в превью — заглушки. */
internal class ActEditActions(
    val updateDraft: ((ActDraft) -> ActDraft) -> Unit,
    val addCatalogItem: (CatalogItemResponse) -> Unit,
    val addFreeLine: () -> Unit,
    val updateLine: (Long, (ActLineDraft) -> ActLineDraft) -> Unit,
    val removeLine: (Long) -> Unit,
    val next: () -> Unit,
)

/** Оформление акта: работы → подпись. Готовый акт уходит офлайн-очередью. */
@Composable
fun ActEditorScreen(
    onDone: () -> Unit,
    onBack: () -> Unit,
    viewModel: ActEditorViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val editActions = remember(viewModel) {
        ActEditActions(
            updateDraft = viewModel::updateDraft,
            addCatalogItem = viewModel::addCatalogItem,
            addFreeLine = viewModel::addFreeLine,
            updateLine = viewModel::updateLine,
            removeLine = viewModel::removeLine,
            next = viewModel::goToSigning,
        )
    }

    var confirmExit by rememberSaveable { mutableStateOf(false) }
    val back: () -> Unit = {
        val draft = state.draft
        when {
            state.step == ActEditorViewModel.Step.SIGN -> viewModel.backToEditing()
            draft.lines.isNotEmpty() || draft.workSummary.isNotBlank() -> confirmExit = true
            else -> onBack()
        }
    }

    LaunchedEffect(state.isDone) {
        if (state.isDone) onDone()
    }
    BackHandler(onBack = back)

    ActEditorContent(
        state = state,
        editActions = editActions,
        onSubmit = viewModel::submit,
        onBack = back,
        onDismissError = viewModel::dismissError,
    )

    if (confirmExit) {
        AlertDialog(
            onDismissRequest = { confirmExit = false },
            title = { Text("Выйти без акта?") },
            text = { Text("Набранные строки не сохранятся.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmExit = false
                        onBack()
                    },
                ) { Text("Выйти") }
            },
            dismissButton = { TextButton(onClick = { confirmExit = false }) { Text("Остаться") } },
        )
    }
}

/** Экран без ViewModel — для превью и скриншотов. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ActEditorContent(
    state: ActEditorViewModel.UiState,
    editActions: ActEditActions,
    onSubmit: (ActSigningResult, ByteArray?) -> Unit,
    onBack: () -> Unit,
    onDismissError: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = if (state.step == ActEditorViewModel.Step.EDIT) "Акт: работы" else "Акт: подпись",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        state.task?.let {
                            Text(
                                text = "Заявка #${it.getDisplayNumber()}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                    }
                },
            )
        },
    ) { padding ->
        when (state.step) {
            ActEditorViewModel.Step.EDIT -> EditStep(
                draft = state.draft,
                catalog = state.catalog,
                actions = editActions,
                modifier = Modifier.padding(padding),
            )
            ActEditorViewModel.Step.SIGN -> SignStep(
                draft = state.draft,
                hasWorkerSignature = state.hasWorkerSignature,
                isSubmitting = state.isSubmitting,
                onSubmit = onSubmit,
                modifier = Modifier.padding(padding),
            )
        }
    }

    state.error?.let { error ->
        AlertDialog(
            onDismissRequest = onDismissError,
            confirmButton = { TextButton(onClick = onDismissError) { Text("Понятно") } },
            title = { Text("Акт не сохранён") },
            text = { Text(error) },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EditStep(
    draft: ActDraft,
    catalog: List<CatalogItemResponse>,
    actions: ActEditActions,
    modifier: Modifier = Modifier,
) {
    var showCatalog by rememberSaveable { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxSize().imePadding()) {
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { SectionTitle("Работы и материалы") }
            items(draft.lines, key = { it.key }) { line ->
                LineEditor(
                    line = line,
                    onChange = { transform -> actions.updateLine(line.key) { transform(it) } },
                    onRemove = { actions.removeLine(line.key) },
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { showCatalog = true }, enabled = catalog.isNotEmpty()) {
                        Icon(Icons.Default.Search, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Из прайса")
                    }
                    OutlinedButton(onClick = actions.addFreeLine) {
                        Icon(Icons.Default.Add, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Своя строка")
                    }
                }
                if (catalog.isEmpty()) {
                    Text(
                        text = "Прайс не загружен — добавьте строки вручную.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
            item {
                Text(
                    text = "Итого: ${formatRub(draft.total)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            item {
                OutlinedTextField(
                    value = draft.workSummary,
                    onValueChange = { value -> actions.updateDraft { it.copy(workSummary = value) } },
                    label = { Text("Что сделано") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item { SectionTitle("Заказчик") }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = draft.customerName,
                        onValueChange = { value -> actions.updateDraft { it.copy(customerName = value) } },
                        label = { Text("ФИО") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ActSignerRole.entries.forEach { role ->
                            FilterChip(
                                selected = draft.customerRole == role,
                                onClick = { actions.updateDraft { it.copy(customerRole = role) } },
                                label = { Text(role.label) },
                            )
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = draft.customerPhone,
                            onValueChange = { value -> actions.updateDraft { it.copy(customerPhone = value) } },
                            label = { Text("Телефон") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = draft.apartment,
                            onValueChange = { value -> actions.updateDraft { it.copy(apartment = value) } },
                            label = { Text("Кв.") },
                            singleLine = true,
                            modifier = Modifier.width(96.dp),
                        )
                    }
                }
            }
            if (draft.total.signum() > 0) {
                item { SectionTitle("Оплата") }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ActPaymentMethod.entries.forEach { method ->
                            FilterChip(
                                selected = draft.paymentMethod == method,
                                onClick = { actions.updateDraft { it.copy(paymentMethod = method) } },
                                label = { Text(method.label) },
                            )
                        }
                    }
                }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Претензий нет",
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(
                        checked = draft.noClaims,
                        onCheckedChange = { checked -> actions.updateDraft { it.copy(noClaims = checked) } },
                    )
                }
                if (!draft.noClaims) {
                    OutlinedTextField(
                        value = draft.remarks,
                        onValueChange = { value -> actions.updateDraft { it.copy(remarks = value) } },
                        label = { Text("Замечания заказчика") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    )
                }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
        Button(
            onClick = actions.next,
            enabled = draft.canSubmit,
            modifier = Modifier.fillMaxWidth().padding(16.dp).height(52.dp),
        ) {
            Text(if (draft.canSubmit) "Далее — подпись" else "Добавьте работы или опишите, что сделано")
        }
    }

    if (showCatalog) {
        CatalogSheet(
            catalog = catalog,
            onPick = { item ->
                actions.addCatalogItem(item)
                showCatalog = false
            },
            onDismiss = { showCatalog = false },
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontWeight = FontWeight.SemiBold,
    )
}

@Composable
private fun LineEditor(
    line: ActLineDraft,
    onChange: ((ActLineDraft) -> ActLineDraft) -> Unit,
    onRemove: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = line.name,
                    onValueChange = { value -> onChange { it.copy(name = value) } },
                    label = { Text(if (line.isMaterial) "Материал" else "Работа") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onRemove) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = "Удалить строку",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = line.qty,
                    onValueChange = { value -> onChange { it.copy(qty = value) } },
                    label = { Text("Кол-во") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = line.unit,
                    onValueChange = { value -> onChange { it.copy(unit = value) } },
                    label = { Text("Ед.") },
                    singleLine = true,
                    modifier = Modifier.width(72.dp),
                )
                OutlinedTextField(
                    value = line.price,
                    onValueChange = { value -> onChange { it.copy(price = value) } },
                    label = { Text("Цена") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1.2f),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                FilterChip(
                    selected = line.isMaterial,
                    onClick = { onChange { it.copy(isMaterial = !it.isMaterial) } },
                    label = { Text("Материал") },
                )
                Spacer(Modifier.weight(1f))
                Text(
                    text = formatRub(line.amount),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CatalogSheet(
    catalog: List<CatalogItemResponse>,
    onPick: (CatalogItemResponse) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    val visible = remember(catalog, query) {
        catalog.filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }
    }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(horizontal = 16.dp)) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("Поиск по прайсу") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            LazyColumn(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                items(visible, key = { it.id }) { item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onPick(item) }
                            .padding(vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(item.name, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                text = if (item.lineType == CatalogItemResponse.LineType.MATERIAL) "материал" else "работа",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            text = "${formatRub(item.price ?: BigDecimal.ZERO)} / ${item.unit ?: "усл"}",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                }
            }
        }
    }
}

@Composable
private fun SignStep(
    draft: ActDraft,
    hasWorkerSignature: Boolean,
    isSubmitting: Boolean,
    onSubmit: (ActSigningResult, ByteArray?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val customer = remember { SignatureState() }
    val worker = remember { SignatureState() }
    var showRefusal by rememberSaveable { mutableStateOf(false) }
    var redrawWorker by rememberSaveable { mutableStateOf(false) }
    val drawWorker = !hasWorkerSignature || redrawWorker
    val strokeWidthPx = with(LocalDensity.current) { 3.dp.toPx() }
    val newWorkerSignature = { if (drawWorker) worker.toPng(strokeWidthPx) else null }
    val canSign = !customer.isEmpty && (!drawWorker || !worker.isEmpty)

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Surface(
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        ) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Text(
                    text = formatRub(draft.total),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = buildString {
                        append("Строк: ${draft.filledLines.size}")
                        if (draft.customerName.isNotBlank()) append(" · ${draft.customerName.trim()}")
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (draft.noClaims) {
                    Text(
                        text = "Заказчик претензий по объёму, качеству и срокам не имеет",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        }

        if (drawWorker) {
            SignatureBlock(
                title = "Подпись мастера",
                subtitle = "Нарисуйте один раз — подставим в следующие акты",
                state = worker,
                height = 140,
            )
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Подпись мастера — сохранённая",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { redrawWorker = true }) { Text("Изменить") }
            }
        }
        SignatureBlock(title = "Подпись заказчика", state = customer, height = 220)

        Button(
            onClick = {
                onSubmit(
                    ActSigningResult.Signed(
                        customerPng = checkNotNull(customer.toPng(strokeWidthPx)),
                        strokesJson = customer.strokesJson(),
                    ),
                    newWorkerSignature(),
                )
            },
            enabled = canSign && !isSubmitting,
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
            Text("Подписать и сохранить")
        }
        OutlinedButton(
            onClick = { onSubmit(ActSigningResult.Later, newWorkerSignature()) },
            enabled = !isSubmitting,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Подпишет позже")
        }
        TextButton(
            onClick = { showRefusal = true },
            enabled = !isSubmitting,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Отказ от подписи", color = MaterialTheme.colorScheme.error)
        }
        Text(
            text = "Акт отправится при связи — номер присвоит сервер.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    if (showRefusal) {
        RefusalDialog(
            onConfirm = { reason ->
                showRefusal = false
                onSubmit(ActSigningResult.Refused(reason), newWorkerSignature())
            },
            onDismiss = { showRefusal = false },
        )
    }
}

@Composable
private fun SignatureBlock(title: String, state: SignatureState, height: Int, subtitle: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                subtitle?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            TextButton(onClick = state::clear, enabled = !state.isEmpty) { Text("Стереть") }
        }
        SignaturePad(state = state, modifier = Modifier.fillMaxWidth().height(height.dp))
    }
}

@Composable
private fun RefusalDialog(onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var reason by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Отказ от подписи") },
        text = {
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                label = { Text("Причина со слов заказчика") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(reason.trim()) }, enabled = reason.isNotBlank()) {
                Text("Сохранить")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
    )
}
