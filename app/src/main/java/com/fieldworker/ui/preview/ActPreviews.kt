package com.fieldworker.ui.preview

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.fieldworker.data.remote.generated.ActResponse
import com.fieldworker.data.remote.generated.CatalogItemResponse
import com.fieldworker.data.remote.generated.TaskPanelResponse
import com.fieldworker.data.repository.ScanCode
import com.fieldworker.domain.model.ActDraft
import com.fieldworker.domain.model.ActLineDraft
import com.fieldworker.domain.model.ActPaymentMethod
import com.fieldworker.domain.model.PendingAct
import com.fieldworker.domain.model.PendingActKind
import com.fieldworker.ui.act.ActEditActions
import com.fieldworker.ui.act.ActEditorContent
import com.fieldworker.ui.act.ActEditorViewModel
import com.fieldworker.ui.act.PublicLinkContent
import com.fieldworker.ui.act.TaskActsContent
import com.fieldworker.ui.act.TaskActsViewModel
import com.fieldworker.ui.remote.TaskRemoteContent
import com.fieldworker.ui.remote.TaskRemoteViewModel
import com.fieldworker.ui.components.SignaturePad
import com.fieldworker.ui.components.SignatureState
import com.fieldworker.ui.theme.FieldWorkerTheme
import java.math.BigDecimal
import kotlin.math.sin

private val previewActDraft = ActDraft(
    lines = listOf(
        ActLineDraft(key = 1, catalogItemId = 3, name = "Замена абонентской трубки", price = "1500"),
        ActLineDraft(
            key = 2,
            catalogItemId = 8,
            isMaterial = true,
            name = "Трубка УКП-12М",
            unit = "шт",
            price = "1290",
        ),
    ),
    customerName = "Петрова Анна Сергеевна",
    customerPhone = "+7 921 555-12-34",
    apartment = "45",
    workSummary = "Заменена трубка, проверен вызов с панели",
    paymentMethod = ActPaymentMethod.CASH,
)

private val previewCatalog = listOf(
    CatalogItemResponse(name = "Замена абонентской трубки", id = 3, price = BigDecimal("1500")),
    CatalogItemResponse(
        name = "Трубка УКП-12М",
        id = 8,
        lineType = CatalogItemResponse.LineType.MATERIAL,
        unit = "шт",
        price = BigDecimal("1290"),
    ),
)

private val noopEditActions = ActEditActions(
    updateDraft = {},
    addCatalogItem = {},
    addFreeLine = {},
    updateLine = { _, _ -> },
    removeLine = {},
    next = {},
)

@Composable
private fun ActEditorPreviewScreen(state: ActEditorViewModel.UiState, darkTheme: Boolean = false) {
    FieldWorkerTheme(darkTheme = darkTheme) {
        ActEditorContent(
            state = state,
            editActions = noopEditActions,
            onSubmit = { _, _ -> },
            onBack = {},
            onDismissError = {},
        )
    }
}

@Preview(name = "Act editor - Lines", showBackground = true, showSystemUi = true)
@Composable
internal fun ActEditorPreview() {
    ActEditorPreviewScreen(
        ActEditorViewModel.UiState(
            task = PreviewData.taskInProgress,
            draft = previewActDraft,
            catalog = previewCatalog,
        )
    )
}

@Preview(name = "Act editor - Empty, no price list", showBackground = true, showSystemUi = true)
@Composable
internal fun ActEditorEmptyPreview() {
    ActEditorPreviewScreen(
        ActEditorViewModel.UiState(
            task = PreviewData.taskInProgress,
            draft = ActDraft(customerName = "Петрова Анна Сергеевна", apartment = "45"),
        )
    )
}

@Preview(name = "Act editor - Signing", showBackground = true, showSystemUi = true)
@Composable
internal fun ActSigningPreview() {
    ActEditorPreviewScreen(
        ActEditorViewModel.UiState(
            task = PreviewData.taskInProgress,
            draft = previewActDraft,
            step = ActEditorViewModel.Step.SIGN,
        )
    )
}

@Preview(name = "Act editor - Signing, dark", showBackground = true, showSystemUi = true)
@Composable
internal fun ActSigningDarkPreview() {
    ActEditorPreviewScreen(
        ActEditorViewModel.UiState(
            task = PreviewData.taskInProgress,
            draft = previewActDraft,
            step = ActEditorViewModel.Step.SIGN,
            hasWorkerSignature = true,
        ),
        darkTheme = true,
    )
}

/** Росчерк-синусоида: как площадка рисует подпись и линию под ней. */
@Composable
private fun rememberPreviewSignature(): SignatureState = remember {
    SignatureState().apply {
        begin(Offset(60f, 330f), uptimeMillis = 0)
        for (i in 1..60) {
            val x = 60f + i * 14f
            extend(Offset(x, 300f + 70f * sin(i / 5f) - i * 1.5f), uptimeMillis = i * 16L)
        }
        end()
        begin(Offset(420f, 210f), uptimeMillis = 1_200)
        extend(Offset(470f, 380f), uptimeMillis = 1_260)
        end()
    }
}

@Preview(name = "SignaturePad - Drawn", showBackground = true)
@Composable
internal fun SignaturePadPreview() {
    Column {
        listOf(false, true).forEach { dark ->
            FieldWorkerTheme(darkTheme = dark) {
                Surface(color = MaterialTheme.colorScheme.background) {
                    SignaturePad(
                        state = rememberPreviewSignature(),
                        modifier = Modifier.fillMaxWidth().padding(16.dp).height(160.dp),
                    )
                }
            }
        }
    }
}

private val previewPendingServerAct = ActResponse(
    id = 42,
    number = "ТС-2026-000042",
    status = ActResponse.Status.PENDING_SIGNATURE,
    paymentMethod = ActResponse.PaymentMethod.CASH,
    totalAmount = BigDecimal("1500.00"),
    documentHash = "",
    createdAt = "2026-11-01T12:30:00",
)

private val previewServerActs = TaskActsViewModel.ServerActs(
    acts = listOf(
        previewPendingServerAct,
        ActResponse(
            id = 41,
            number = "ТС-2026-000041",
            status = ActResponse.Status.SIGNED,
            paymentMethod = ActResponse.PaymentMethod.CASH,
            totalAmount = BigDecimal("2790.00"),
            documentHash = "",
            createdAt = "2026-10-30T14:12:00",
        ),
        ActResponse(
            id = 38,
            number = "ТС-2026-000038",
            status = ActResponse.Status.REFUSED,
            paymentMethod = ActResponse.PaymentMethod.NONE,
            totalAmount = BigDecimal("0.00"),
            documentHash = "",
            createdAt = "2026-10-21T10:40:00",
        ),
    ),
)

@Preview(name = "TaskActsSection - States", showBackground = true)
@Composable
internal fun TaskActsSectionPreview() {
    FieldWorkerTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                TaskActsContent(
                    pendingActs = listOf(
                        PendingAct(id = 1, total = BigDecimal("2790.00"), kind = PendingActKind.SIGNED, isFailed = false),
                        PendingAct(id = 2, total = BigDecimal("0.00"), kind = PendingActKind.AWAITING, isFailed = true),
                    ),
                    serverActs = previewServerActs,
                    onCreateAct = {},
                    onOpenPdf = {},
                )
                TaskActsContent(
                    pendingActs = emptyList(),
                    serverActs = TaskActsViewModel.ServerActs(acts = emptyList()),
                    onCreateAct = {},
                    onOpenPdf = {},
                )
                TaskActsContent(
                    pendingActs = emptyList(),
                    serverActs = TaskActsViewModel.ServerActs(unavailable = true),
                    onCreateAct = {},
                    onOpenPdf = {},
                )
            }
        }
    }
}

@Preview(name = "Act public link - QR", showBackground = true)
@Composable
internal fun PublicLinkPreview() {
    FieldWorkerTheme {
        Surface(color = MaterialTheme.colorScheme.surface) {
            Column(modifier = Modifier.padding(24.dp)) {
                PublicLinkContent(
                    act = previewPendingServerAct,
                    url = "https://balalayka.duckdns.org/portal/a/aUoA2CTBjnadKm_p_gEgzGUvte0UMPGIbYqWTFn6NN4",
                    expiresAt = "2026-11-15T12:30:00Z",
                )
            }
        }
    }
}

@Preview(name = "TaskRemoteSection - Panels", showBackground = true)
@Composable
internal fun TaskRemoteSectionPreview() {
    FieldWorkerTheme {
        Surface(color = MaterialTheme.colorScheme.background) {
            Column(modifier = Modifier.padding(16.dp)) {
                TaskRemoteContent(
                    panels = listOf(
                        TaskRemoteViewModel.PanelState(
                            panel = TaskPanelResponse(id = 1, addressId = 7, label = "Подъезд 1", model = "Beward DKS15198"),
                            doorOpen = false,
                            scanCode = ScanCode(code = "55787", active = true),
                        ),
                        TaskRemoteViewModel.PanelState(
                            panel = TaskPanelResponse(id = 2, addressId = 7, entrance = "2", model = "Beward DKS15198"),
                            isBusy = true,
                        ),
                    ),
                    canResolve = true,
                    onOpenDoor = {},
                    onCheckLock = {},
                    onScanCode = {},
                    onVideo = {},
                    onResolve = {},
                )
            }
        }
    }
}

