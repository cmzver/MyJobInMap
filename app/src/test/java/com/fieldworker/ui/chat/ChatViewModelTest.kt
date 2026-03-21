package com.fieldworker.ui.chat

import com.fieldworker.data.preferences.AppPreferences
import com.fieldworker.data.realtime.ChatRealtimeEvent
import com.fieldworker.data.repository.ChatRepository
import com.fieldworker.data.repository.UsersRepository
import com.fieldworker.domain.model.ChatAttachment
import com.fieldworker.domain.model.ChatMessage
import com.fieldworker.domain.model.ChatReaction
import com.fieldworker.domain.model.Conversation
import com.fieldworker.domain.model.ConversationDetail
import com.fieldworker.domain.model.ConversationMember
import com.fieldworker.domain.model.ConversationType
import com.fieldworker.domain.model.LastMessagePreview
import com.fieldworker.domain.model.MessageType
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.runs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test
import java.time.LocalDateTime

@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModelTest {

    companion object {
        private const val CONVERSATION_ID = 77L
        private const val CURRENT_USER_ID = 1L
        private val BASE_TIME: LocalDateTime = LocalDateTime.of(2026, 3, 19, 12, 0)

        @JvmStatic
        @BeforeClass
        fun setupClass() {
            mockkStatic(android.util.Log::class)
            every { android.util.Log.d(any(), any()) } returns 0
            every { android.util.Log.w(any(), any<String>()) } returns 0
            every { android.util.Log.w(any(), any<String>(), any()) } returns 0
            every { android.util.Log.e(any(), any()) } returns 0
            every { android.util.Log.e(any(), any(), any()) } returns 0
        }
    }

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var chatRepository: ChatRepository
    private lateinit var usersRepository: UsersRepository
    private lateinit var preferences: AppPreferences
    private lateinit var realtimeEvents: MutableSharedFlow<ChatRealtimeEvent>

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        chatRepository = mockk()
        usersRepository = mockk(relaxed = true)
        preferences = mockk(relaxed = true)
        realtimeEvents = MutableSharedFlow(extraBufferCapacity = 8)

        every { chatRepository.realtimeEvents } returns realtimeEvents
        every { chatRepository.connectRealtime() } just runs
        every { preferences.getUserId() } returns CURRENT_USER_ID

        coEvery { chatRepository.getConversations(true) } returns Result.success(
            listOf(
                conversation(
                    unreadCount = 3,
                    lastMessageId = 13L,
                )
            )
        )
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `openConversation prepares unread anchor and visible read updates counter gradually`() = runTest {
        coEvery { chatRepository.getConversationDetail(CONVERSATION_ID) } returns Result.success(conversationDetail())
        coEvery { chatRepository.getMessages(CONVERSATION_ID, null, 30) } returns Result.success(
            listOf(message(11L), message(12L), message(13L)) to false
        )
        coEvery { chatRepository.markAsRead(CONVERSATION_ID, 12L) } returns Result.success(Unit)

        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.openConversation(CONVERSATION_ID)
        advanceUntilIdle()

        assertEquals(11L, viewModel.chatState.value.pendingUnreadAnchorMessageId)
        coVerify(exactly = 0) { chatRepository.markAsRead(any(), any()) }

        viewModel.consumeUnreadAnchor()
        viewModel.markVisibleMessagesAsRead(12L)
        advanceUntilIdle()

        coVerify(exactly = 1) { chatRepository.markAsRead(CONVERSATION_ID, 12L) }
        assertEquals(1, viewModel.listState.value.conversations.first().unreadCount)
    }

    @Test
    fun `loadMoreMessages uses oldest loaded message id as cursor`() = runTest {
        coEvery { chatRepository.getConversationDetail(CONVERSATION_ID) } returns Result.success(conversationDetail())
        coEvery { chatRepository.getMessages(CONVERSATION_ID, null, 30) } returns Result.success(
            listOf(message(11L), message(12L), message(13L)) to true
        )
        coEvery { chatRepository.getMessages(CONVERSATION_ID, 11L, 30) } returns Result.success(
            listOf(message(9L), message(10L)) to false
        )
        val viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.openConversation(CONVERSATION_ID)
        advanceUntilIdle()

        viewModel.loadMoreMessages()
        advanceUntilIdle()

        coVerify(exactly = 1) { chatRepository.getMessages(CONVERSATION_ID, 11L, 30) }
    }

    private fun createViewModel(): ChatViewModel =
        ChatViewModel(chatRepository, usersRepository, preferences)

    private fun conversation(
        unreadCount: Int,
        lastMessageId: Long,
    ): Conversation = Conversation(
        id = CONVERSATION_ID,
        type = ConversationType.DIRECT,
        name = "Чат",
        displayName = "Иван Петров",
        avatarUrl = null,
        taskId = null,
        unreadCount = unreadCount,
        isMuted = false,
        isArchived = false,
        lastMessage = LastMessagePreview(
            id = lastMessageId,
            text = "Последнее сообщение",
            senderName = "Иван Петров",
            createdAt = BASE_TIME.plusMinutes(3),
        ),
        createdAt = BASE_TIME,
        updatedAt = BASE_TIME.plusMinutes(3),
    )

    private fun conversationDetail(): ConversationDetail = ConversationDetail(
        id = CONVERSATION_ID,
        type = ConversationType.DIRECT,
        name = "Чат",
        displayName = "Иван Петров",
        avatarUrl = null,
        taskId = null,
        organizationId = null,
        createdAt = BASE_TIME,
        updatedAt = BASE_TIME.plusMinutes(3),
        members = listOf(
            ConversationMember(
                userId = CURRENT_USER_ID,
                username = "worker",
                avatarUrl = null,
                fullName = "Текущий Пользователь",
                role = "member",
                lastReadMessageId = null,
                isMuted = false,
                isArchived = false,
            ),
            ConversationMember(
                userId = 2L,
                username = "ivan",
                avatarUrl = null,
                fullName = "Иван Петров",
                role = "member",
                lastReadMessageId = null,
                isMuted = false,
                isArchived = false,
            ),
        ),
    )

    private fun message(id: Long): ChatMessage = ChatMessage(
        id = id,
        conversationId = CONVERSATION_ID,
        senderId = 2L,
        senderName = "Иван Петров",
        text = "Сообщение $id",
        messageType = MessageType.TEXT,
        isEdited = false,
        isDeleted = false,
        replyTo = null,
        attachments = emptyList<ChatAttachment>(),
        reactions = emptyList<ChatReaction>(),
        createdAt = BASE_TIME.plusMinutes(id),
        editedAt = null,
    )
}
