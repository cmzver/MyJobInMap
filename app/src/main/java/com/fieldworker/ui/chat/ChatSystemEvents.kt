package com.fieldworker.ui.chat

/**
 * Заголовок системного события чата. Цвета у событий нет: в интерфейсе цвет
 * несёт статус заявки, а служебные строки чата — спокойный нейтрал.
 */
internal data class ChatSystemEventMeta(
    val title: String,
)

internal fun resolveChatSystemEventMeta(text: String?): ChatSystemEventMeta {
    val value = text.orEmpty().trim()

    return when {
        Regex("^переименовал\\(а\\) чат в ", RegexOption.IGNORE_CASE).containsMatchIn(value) -> {
            ChatSystemEventMeta("Название группы изменено")
        }
        Regex("добавил\\(а\\).+в чат", RegexOption.IGNORE_CASE).containsMatchIn(value) -> {
            ChatSystemEventMeta("Участник добавлен")
        }
        Regex("удалил\\(а\\).+из чата", RegexOption.IGNORE_CASE).containsMatchIn(value) -> {
            ChatSystemEventMeta("Участник удалён")
        }
        Regex("^вышел\\(а\\) из чата$", RegexOption.IGNORE_CASE).containsMatchIn(value) -> {
            ChatSystemEventMeta("Участник вышел")
        }
        // Старый вид сообщений сервера (admin/member, ownership) — тоже узнаём
        Regex("изменил\\(а\\) роль .+ на (admin|member|«администратор»|«участник»)", RegexOption.IGNORE_CASE).containsMatchIn(value) -> {
            ChatSystemEventMeta("Роль участника изменена")
        }
        Regex("передал\\(а\\) (ownership|права владельца) пользователю", RegexOption.IGNORE_CASE).containsMatchIn(value) -> {
            ChatSystemEventMeta("Владелец сменился")
        }
        else -> ChatSystemEventMeta("Системное событие")
    }
}
