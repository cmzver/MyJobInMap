package com.fieldworker.ui.screenshot

import android.app.Application
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import com.fieldworker.ui.preview.*
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.test.onLast
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Скриншоты ключевых экранов из @Preview-композиций (без сервера и эмулятора).
 *
 * Запуск: ./gradlew :app:testDebugUnitTest -Pscreenshots --tests "*.screenshot.*"
 * Результат: app/build/outputs/roborazzi/<name>.png
 *
 * Application подменён на пустой, чтобы не поднимать Hilt/Firebase.
 */
@RunWith(ParameterizedRobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi", application = Application::class)
class ScreenshotTest(
    private val name: String,
    private val content: @Composable () -> Unit,
) {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun capture() {
        // Ручные часы: бесконечные анимации (скелетоны, индикаторы) не дают
        // Compose стать idle, а шторке/диалогу нужно время на выезд.
        composeRule.mainClock.autoAdvance = false
        composeRule.setContent { content() }
        composeRule.mainClock.advanceTimeBy(2_000)
        // Верхний root: экран, а для шторки/диалога — их собственное окно
        composeRule.onAllNodes(isRoot()).onLast()
            .captureRoboImage("build/outputs/roborazzi/$name.png")
    }

    companion object {
        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}")
        fun screens(): List<Array<Any>> = listOf<Pair<String, @Composable () -> Unit>>(
            "task_list" to { TaskListScreenPreview() },
            "task_list_empty" to { TaskListScreenEmptyPreview() },
            "task_detail" to { TaskDetailContentPreview() },
            "task_card_variants" to { TaskCardVariantsPreview() },
            "task_card_dark" to { TaskCardDarkPreview() },
            "filters_panel" to { FiltersPanelPreview() },
            "map_stats_bar" to { TasksStatsBarPreview() },
            "map_legend" to { FullLegendPreview() },
            "addresses" to { MyAddressesListPreview() },
            "address_detail" to { AddressDetailPreview() },
            "chat_list" to { ChatListLightPreview() },
            "chat_list_dark" to { ChatListDarkPreview() },
            "chat_screen" to { ChatScreenFullPreview() },
            "chat_screen_dark" to { ChatScreenDarkCompactPreview() },
            "theme_light" to { LightThemePreview() },
            "theme_dark" to { DarkThemePreview() },
        ).map { (name, content) -> arrayOf(name, content) }
    }
}
