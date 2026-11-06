package com.fieldworker.data.repository

import android.content.Context
import android.os.Build
import android.util.Log
import com.fieldworker.data.api.ActsApi
import com.fieldworker.data.image.PendingActStore
import com.fieldworker.data.local.dao.PendingActionDao
import com.fieldworker.data.local.entity.ActionType
import com.fieldworker.data.local.entity.PendingAction
import com.fieldworker.data.mapper.ActSigningMeta
import com.fieldworker.data.mapper.buildActPayload
import com.fieldworker.data.remote.generated.ActPublicLink
import com.fieldworker.data.remote.generated.ActResponse
import com.fieldworker.data.remote.generated.CatalogItemResponse
import com.fieldworker.data.remote.generated.StockResponse
import com.fieldworker.data.remote.generated.TaskStatusLink
import com.fieldworker.domain.model.ActDraft
import com.fieldworker.domain.model.PendingAct
import com.fieldworker.domain.model.PendingActKind
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import com.fieldworker.data.network.toUserMessage

/** Как мастер завершил подпись акта. */
sealed interface ActSigningResult {
    /** Клиент расписался на экране. */
    data class Signed(val customerPng: ByteArray, val strokesJson: String) : ActSigningResult

    /** Клиент отказался подписывать. */
    data class Refused(val reason: String) : ActSigningResult

    /** Подпишет позже — на бумаге или по ссылке. */
    data object Later : ActSigningResult
}

/**
 * Акты выполненных работ на телефоне мастера: прайс (с кешем на диске —
 * акт оформляется и без сети), акты заявки, отправка через офлайн-очередь,
 * PDF и сохранённая подпись мастера.
 */
@Singleton
class ActsRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val actsApi: ActsApi,
    private val pendingActionDao: PendingActionDao,
    private val pendingActStore: PendingActStore,
    private val json: Json,
) {
    companion object {
        private const val TAG = "ActsRepository"
        private const val CATALOG_CACHE = "service_catalog.json"
        private const val STOCKS_CACHE = "my_stocks.json"
        private const val WORKER_SIGNATURE = "my_signature.png"
        private const val PDF_DIR = "acts"
    }

    private val catalogSerializer = ListSerializer(CatalogItemResponse.serializer())
    private val stocksSerializer = ListSerializer(StockResponse.serializer())
    private val catalogCache: File
        get() = File(context.filesDir, CATALOG_CACHE)
    private val workerSignatureFile: File
        get() = File(context.filesDir, WORKER_SIGNATURE)

    /** Прайс с сервера; без связи — последний сохранённый. */
    suspend fun catalog(): List<CatalogItemResponse> = withContext(Dispatchers.IO) {
        try {
            val response = actsApi.getCatalog()
            val items = response.body()
            if (response.isSuccessful && items != null) {
                catalogCache.writeText(json.encodeToString(catalogSerializer, items))
                return@withContext items
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Catalog unavailable, using cache: ${e.message}")
        }
        readCachedCatalog()
    }

    private fun readCachedCatalog(): List<CatalogItemResponse> = try {
        catalogCache.takeIf { it.isFile }
            ?.let { json.decodeFromString(catalogSerializer, it.readText()) }
            .orEmpty()
    } catch (e: Exception) {
        Log.w(TAG, "Broken catalog cache: ${e.message}")
        emptyList()
    }

    /**
     * Мои остатки материалов. Без связи — последние сохранённые (fromCache =
     * true), чтобы мастер видел, что у него на руках, и в подвале.
     */
    suspend fun myStocks(): Result<Pair<List<StockResponse>, Boolean>> = withContext(Dispatchers.IO) {
        val cache = File(context.filesDir, STOCKS_CACHE)
        try {
            val response = actsApi.getMyStocks()
            val items = response.body()
            if (response.isSuccessful && items != null) {
                cache.writeText(json.encodeToString(stocksSerializer, items))
                return@withContext Result.success(items to false)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Stocks unavailable, using cache: ${e.message}")
        }
        try {
            if (cache.isFile) {
                Result.success(json.decodeFromString(stocksSerializer, cache.readText()) to true)
            } else {
                Result.failure(Exception("Остатки загрузятся, когда появится связь"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Остатки загрузятся, когда появится связь", e))
        }
    }

    /** Ссылка заявителю на статус заявки — нужна связь с сервером. */
    suspend fun statusLink(taskId: Long): Result<TaskStatusLink> = withContext(Dispatchers.IO) {
        try {
            val response = actsApi.createTaskStatusLink(taskId)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception("Ошибка: ${response.code()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(Exception("Ссылка доступна при связи с сервером", e))
        }
    }

    suspend fun taskActs(taskId: Long): Result<List<ActResponse>> = withContext(Dispatchers.IO) {
        try {
            val response = actsApi.getTaskActs(taskId)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception("Ошибка: ${response.code()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Акты заявки в очереди отправки. */
    fun pendingActsFlow(taskId: Long): Flow<List<PendingAct>> =
        pendingActionDao.getPendingActsFlow(taskId)
            .map { actions -> actions.map { it.toPendingAct() } }
            .flowOn(Dispatchers.IO)

    private fun PendingAction.toPendingAct(): PendingAct {
        val payload = runCatching { json.parseToJsonElement(payloadJson.orEmpty()).jsonObject }
            .getOrNull()
        val total = payload?.get("lines")
            ?.let { runCatching { json.decodeFromJsonElement(ListSerializer(LineTotal.serializer()), it) }.getOrNull() }
            .orEmpty()
            .fold(BigDecimal.ZERO) { sum, line -> sum + line.amount() }
        val dir = filePath?.let(::File)
        val kind = when {
            dir != null && pendingActStore.customerSignature(dir) != null -> PendingActKind.SIGNED
            payload?.get("refusal_reason")?.jsonPrimitive?.contentOrNull != null -> PendingActKind.REFUSED
            else -> PendingActKind.AWAITING
        }
        return PendingAct(
            id = id,
            total = total,
            kind = kind,
            isFailed = retryCount >= OfflineFirstTasksRepository.MAX_PENDING_RETRIES,
        )
    }

    /**
     * Поставить акт в очередь: файлы подписей — в files/pending_acts, тело —
     * в очередь. Отправится при связи до смены статуса той же заявки; повтор
     * после потерянного ответа не создаст второй акт (Idempotency-Key).
     */
    suspend fun enqueueAct(
        taskId: Long,
        draft: ActDraft,
        signing: ActSigningResult,
        workerSignature: ByteArray?,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        val operationId = UUID.randomUUID().toString()
        val meta = ActSigningMeta(
            signedAt = Instant.now().toString().takeIf { signing is ActSigningResult.Signed },
            device = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(100),
            refusalReason = (signing as? ActSigningResult.Refused)?.reason?.trim(),
        )
        val signed = signing as? ActSigningResult.Signed
        var dir: File? = null
        try {
            dir = pendingActStore.create(
                operationId = operationId,
                customerSignature = signed?.customerPng,
                workerSignature = workerSignature,
                strokesJson = signed?.strokesJson,
            )
            pendingActionDao.insertPendingAction(
                PendingAction(
                    taskId = taskId,
                    actionType = ActionType.SUBMIT_ACT,
                    filePath = dir.absolutePath,
                    payloadJson = buildActPayload(json, draft, meta),
                    operationId = operationId,
                )
            )
            Result.success(Unit)
        } catch (e: CancellationException) {
            pendingActStore.delete(dir?.absolutePath)
            throw e
        } catch (e: Exception) {
            pendingActStore.delete(dir?.absolutePath)
            Result.failure(Exception("Не удалось сохранить акт: ${e.toUserMessage()}", e))
        }
    }

    /** Ссылка клиенту на акт: показать QR или отправить в мессенджер. */
    suspend fun publicLink(actId: Long): Result<ActPublicLink> = withContext(Dispatchers.IO) {
        try {
            val response = actsApi.createPublicLink(actId)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception("Ошибка: ${response.code()}"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(Exception("Ссылка доступна при связи с сервером", e))
        }
    }

    /** Скачать PDF акта во временные файлы — для просмотра и «Поделиться». */
    suspend fun downloadPdf(act: ActResponse): Result<File> = withContext(Dispatchers.IO) {
        try {
            val response = actsApi.getActPdf(act.id)
            val body = response.body()
            if (!response.isSuccessful || body == null) {
                return@withContext Result.failure(Exception("Ошибка: ${response.code()}"))
            }
            val dir = File(context.cacheDir, PDF_DIR).apply { mkdirs() }
            val file = File(dir, "Акт ${act.number.replace('/', '-')}.pdf")
            body.byteStream().use { input -> file.outputStream().use { input.copyTo(it) } }
            Result.success(file)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(Exception("PDF доступен при связи с сервером", e))
        }
    }

    /** Подпись мастера: рисуется один раз и подставляется в следующие акты. */
    suspend fun savedWorkerSignature(): ByteArray? = withContext(Dispatchers.IO) {
        workerSignatureFile.takeIf { it.isFile }?.readBytes()
    }

    suspend fun saveWorkerSignature(png: ByteArray) = withContext(Dispatchers.IO) {
        workerSignatureFile.writeBytes(png)
    }

    /** Строка из тела запроса — только чтобы показать сумму акта в очереди. */
    @Serializable
    private data class LineTotal(
        val qty: Double = 1.0,
        val price: Double = 0.0,
    ) {
        fun amount(): BigDecimal = BigDecimal.valueOf(qty * price).setScale(2, RoundingMode.HALF_UP)
    }
}
