package com.fieldworker.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Шкала скруглений — единственный источник. Раньше в UI жило 16 разных
 * значений (2…28 dp), и интерфейс выглядел «надутым». Теперь четыре ступени:
 *
 * - [sm]  8 dp  — чипы, бейджи, мелкие плашки
 * - [md] 12 dp  — карточки ленты, поля ввода, кнопки
 * - [lg] 16 dp  — секции и группы (карточка заявки, настройки)
 * - [xl] 24 dp  — шторки, поле ввода чата
 *
 * Константы, а не MaterialTheme.shapes — доступны и вне composable-контекста.
 */
object Radius {
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 24.dp
}

object AppShape {
    val sm = RoundedCornerShape(Radius.sm)
    val md = RoundedCornerShape(Radius.md)
    val lg = RoundedCornerShape(Radius.lg)
    val xl = RoundedCornerShape(Radius.xl)
    /** Таблетка: чипы статуса, счётчики. */
    val pill = RoundedCornerShape(percent = 50)
}

val Shapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = AppShape.sm,
    medium = AppShape.md,
    large = AppShape.lg,
    extraLarge = AppShape.xl,
)
