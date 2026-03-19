package com.fieldworker.ui.chat

import com.fieldworker.domain.model.ChatMessage
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

internal sealed interface ChatTimelineItem {
    data class DateSeparator(val key: String, val label: String) : ChatTimelineItem
    data class UnreadSeparator(val key: String, val count: Int) : ChatTimelineItem
    data class MessageEntry(
        val message: ChatMessage,
        val groupedWithPrevious: Boolean,
        val groupedWithNext: Boolean,
    ) : ChatTimelineItem
}

internal fun buildChatTimelineItems(
    messages: List<ChatMessage>,
    currentUserId: Long,
    lastReadMessageId: Long?,
): List<ChatTimelineItem> {
    val sortedMessages = messages.sortedByDescending { it.createdAt }
    val unreadMessages = sortedMessages.filter { message ->
        !message.isDeleted &&
            message.senderId != currentUserId &&
            (lastReadMessageId == null || message.id > lastReadMessageId)
    }
    val oldestUnreadMessageId = unreadMessages.minOfOrNull { it.id }
    val items = mutableListOf<ChatTimelineItem>()
    sortedMessages.forEachIndexed { index, message ->
        items += ChatTimelineItem.MessageEntry(
            message = message,
            groupedWithPrevious = canGroupMessages(message, sortedMessages.getOrNull(index + 1)),
            groupedWithNext = canGroupMessages(sortedMessages.getOrNull(index - 1), message),
        )

        if (message.id == oldestUnreadMessageId) {
            items += ChatTimelineItem.UnreadSeparator(
                key = "unread-${message.id}",
                count = unreadMessages.size,
            )
        }

        val currentDate = message.createdAt.toLocalDate()
        val nextDate = sortedMessages.getOrNull(index + 1)?.createdAt?.toLocalDate()
        if (nextDate == null || currentDate != nextDate) {
            items += ChatTimelineItem.DateSeparator(
                key = "date-${currentDate}",
                label = formatTimelineDateLabel(currentDate),
            )
        }
    }

    return items
}

private fun canGroupMessages(upper: ChatMessage?, lower: ChatMessage?): Boolean {
    if (upper == null || lower == null) return false
    if (upper.isSystem || lower.isSystem) return false
    if (upper.isDeleted || lower.isDeleted) return false
    if (upper.senderId != lower.senderId) return false

    return upper.createdAt.toLocalDate() == lower.createdAt.toLocalDate()
}

private fun formatTimelineDateLabel(date: LocalDate): String {
    val today = LocalDate.now()
    return when (date) {
        today -> "Сегодня"
        today.minusDays(1) -> "Вчера"
        else -> date.format(chatDateSeparatorFormatter)
    }
}

private val chatDateSeparatorFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMM", Locale("ru"))
