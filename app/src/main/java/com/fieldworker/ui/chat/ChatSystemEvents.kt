package com.fieldworker.ui.chat

import androidx.compose.ui.graphics.Color
import androidx.compose.material3.ColorScheme

internal data class ChatSystemEventMeta(
    val title: String,
    val accentColor: (ColorScheme) -> Color,
)

internal fun resolveChatSystemEventMeta(text: String?): ChatSystemEventMeta {
    val value = text.orEmpty().trim()

    return when {
        Regex("^переименовал\\(а\\) чат в ", RegexOption.IGNORE_CASE).containsMatchIn(value) -> {
            ChatSystemEventMeta("Название группы изменено") { it.tertiary }
        }
        Regex("добавил\\(а\\).+в чат", RegexOption.IGNORE_CASE).containsMatchIn(value) -> {
            ChatSystemEventMeta("Участник добавлен") { it.primary }
        }
        Regex("удалил\\(а\\).+из чата", RegexOption.IGNORE_CASE).containsMatchIn(value) -> {
            ChatSystemEventMeta("Участник удалён") { it.error }
        }
        Regex("^вышел\\(а\\) из чата$", RegexOption.IGNORE_CASE).containsMatchIn(value) -> {
            ChatSystemEventMeta("Участник вышел") { it.secondary }
        }
        // Старый вид сообщений сервера (admin/member, ownership) — тоже узнаём
        Regex("изменил\\(а\\) роль .+ на (admin|member|«администратор»|«участник»)", RegexOption.IGNORE_CASE).containsMatchIn(value) -> {
            ChatSystemEventMeta("Роль участника изменена") { it.primary }
        }
        Regex("передал\\(а\\) (ownership|права владельца) пользователю", RegexOption.IGNORE_CASE).containsMatchIn(value) -> {
            ChatSystemEventMeta("Владелец сменился") { it.tertiary }
        }
        else -> ChatSystemEventMeta("Системное событие") { it.onSurfaceVariant }
    }
}