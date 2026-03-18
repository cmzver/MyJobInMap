package com.fieldworker.data.realtime

import android.util.Log
import com.fieldworker.data.preferences.AppPreferences
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton
import android.net.Uri

enum class ChatRealtimeEventType {
    MESSAGE_CREATED,
    MESSAGE_EDITED,
    MESSAGE_DELETED,
    REACTION_CHANGED,
    READ_UPDATED,
    TYPING_CHANGED,
    CONVERSATION_UPDATED,
}

data class ChatRealtimeEvent(
    val type: ChatRealtimeEventType,
    val conversationId: Long,
    val messageId: Long? = null,
    val senderId: Long? = null,
    val userId: Long? = null,
    val isTyping: Boolean? = null,
    val action: String? = null,
    val role: String? = null,
)

@Singleton
class ChatRealtimeClient @Inject constructor(
    @Named("websocket") private val webSocketClient: OkHttpClient,
    private val preferences: AppPreferences,
) {

    private val gson = Gson()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _events = MutableSharedFlow<ChatRealtimeEvent>(extraBufferCapacity = 64)

    val events: SharedFlow<ChatRealtimeEvent> = _events.asSharedFlow()

    @Volatile
    private var webSocket: WebSocket? = null

    @Volatile
    private var manualDisconnect = false

    private var reconnectJob: Job? = null

    fun connect() {
        if (webSocket != null) return

        val token = preferences.getAuthToken()
        val url = token?.let(::buildWebSocketUrl)
        if (token.isNullOrBlank() || url == null) {
            Log.w(TAG, "WebSocket connect skipped: missing token or invalid URL")
            return
        }

        manualDisconnect = false
        reconnectJob?.cancel()
        Log.d(TAG, "Connecting to $url")
        webSocket = webSocketClient.newWebSocket(
            Request.Builder().url(url).build(),
            socketListener,
        )
    }

    fun disconnect() {
        manualDisconnect = true
        reconnectJob?.cancel()
        webSocket?.close(NORMAL_CLOSURE_CODE, "Client disconnect")
        webSocket = null
    }

    fun sendTypingIndicator(conversationId: Long, isTyping: Boolean) {
        val socket = webSocket ?: return
        socket.send(gson.toJson(ChatTypingOutgoingDto(conversationId = conversationId, isTyping = isTyping)))
    }

    private fun buildWebSocketUrl(token: String): String? {
        val baseUrlString = preferences.getFullServerUrl()
        if (baseUrlString.isNullOrBlank()) return null
        val uri = Uri.parse(baseUrlString)
        val wsScheme = if (uri.getScheme() == "https") "wss" else "ws"
        val newUri = uri.buildUpon()
            .scheme(wsScheme)
            .path("/ws")
            .clearQuery()
            .appendQueryParameter("token", token)
            .build()
        return newUri.toString()
    }

    private fun clearSocketIfNeeded(socket: WebSocket) {
        if (webSocket === socket) {
            webSocket = null
        }
    }

    private fun scheduleReconnect() {
        if (manualDisconnect || preferences.getAuthToken().isNullOrBlank()) return
        if (reconnectJob?.isActive == true) return

        reconnectJob = scope.launch {
            delay(RECONNECT_DELAY_MS)
            if (!manualDisconnect && webSocket == null) {
                connect()
            }
        }
    }

    private fun handleIncomingMessage(message: String) {
        val envelope = runCatching {
            gson.fromJson(message, WebSocketEnvelopeDto::class.java)
        }.getOrElse { error ->
            Log.w(TAG, "Failed to parse websocket payload", error)
            return
        }

        val data = envelope.data ?: return
        val conversationId = data.longOrNull("conversation_id") ?: return

        val event = when (envelope.type) {
            "chat_message" -> ChatRealtimeEvent(
                type = ChatRealtimeEventType.MESSAGE_CREATED,
                conversationId = conversationId,
                messageId = data.longOrNull("id"),
                senderId = data.longOrNull("sender_id"),
            )

            "chat_message_edited" -> ChatRealtimeEvent(
                type = ChatRealtimeEventType.MESSAGE_EDITED,
                conversationId = conversationId,
                messageId = data.longOrNull("message_id"),
            )

            "chat_message_deleted" -> ChatRealtimeEvent(
                type = ChatRealtimeEventType.MESSAGE_DELETED,
                conversationId = conversationId,
                messageId = data.longOrNull("message_id"),
            )

            "chat_reaction" -> ChatRealtimeEvent(
                type = ChatRealtimeEventType.REACTION_CHANGED,
                conversationId = conversationId,
                messageId = data.longOrNull("message_id"),
                userId = data.longOrNull("user_id"),
            )

            "chat_read" -> ChatRealtimeEvent(
                type = ChatRealtimeEventType.READ_UPDATED,
                conversationId = conversationId,
                messageId = data.longOrNull("last_message_id"),
                userId = data.longOrNull("user_id"),
            )

            "chat_typing" -> ChatRealtimeEvent(
                type = ChatRealtimeEventType.TYPING_CHANGED,
                conversationId = conversationId,
                userId = data.longOrNull("user_id"),
                isTyping = data.booleanOrNull("is_typing"),
            )

            "chat_conversation_updated" -> ChatRealtimeEvent(
                type = ChatRealtimeEventType.CONVERSATION_UPDATED,
                conversationId = conversationId,
                userId = data.longOrNull("target_user_id"),
                senderId = data.longOrNull("actor_user_id"),
                action = data.stringOrNull("action"),
                role = data.stringOrNull("role"),
            )

            else -> null
        } ?: return

        _events.tryEmit(event)
    }

    private val socketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.d(TAG, "WebSocket connected")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            handleIncomingMessage(text)
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(code, reason)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket closed: $code / $reason")
            clearSocketIfNeeded(webSocket)
            if (code != AUTH_CLOSE_CODE) {
                scheduleReconnect()
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.w(TAG, "WebSocket failure: ${t.message}", t)
            clearSocketIfNeeded(webSocket)
            scheduleReconnect()
        }
    }

    private fun JsonObject.longOrNull(name: String): Long? {
        val element = get(name) ?: return null
        if (element.isJsonNull) return null
        return runCatching { element.asLong }.getOrNull()
    }

    private fun JsonObject.booleanOrNull(name: String): Boolean? {
        val element = get(name) ?: return null
        if (element.isJsonNull) return null
        return runCatching { element.asBoolean }.getOrNull()
    }

    private fun JsonObject.stringOrNull(name: String): String? {
        val element = get(name) ?: return null
        if (element.isJsonNull) return null
        return runCatching { element.asString }.getOrNull()
    }

    private data class WebSocketEnvelopeDto(
        @SerializedName("type") val type: String,
        @SerializedName("data") val data: JsonObject? = null,
    )

    private data class ChatTypingOutgoingDto(
        @SerializedName("type") val type: String = "chat_typing",
        @SerializedName("conversation_id") val conversationId: Long,
        @SerializedName("is_typing") val isTyping: Boolean,
    )

    companion object {
        private const val TAG = "ChatRealtimeClient"
        private const val NORMAL_CLOSURE_CODE = 1000
        private const val AUTH_CLOSE_CODE = 4001
        private const val RECONNECT_DELAY_MS = 3_000L
    }
}