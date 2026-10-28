package com.fieldworker.ui.utils

/**
 * Собирает абсолютный URL аватара для загрузки Coil.
 *
 * - `null`/пустой путь → `null` (аватара нет, UI показывает fallback);
 * - абсолютный URL (`http`/`https`) возвращается как есть;
 * - относительный путь дополняется [baseUrl] (без хвостового `/`).
 *
 * Bearer-токен к запросу добавляет `AuthHeaderInterceptor` в общем Coil ImageLoader,
 * поэтому здесь он не нужен.
 */
fun resolveAvatarUrl(avatarUrl: String?, baseUrl: String?): String? {
    val path = avatarUrl?.trim().takeUnless { it.isNullOrBlank() } ?: return null
    if (path.startsWith("http://") || path.startsWith("https://")) return path
    val base = baseUrl?.trimEnd('/').takeUnless { it.isNullOrBlank() } ?: return null
    return base + (if (path.startsWith("/")) path else "/$path")
}

/**
 * Инициалы для fallback-аватара: до двух заглавных букв из имени.
 * Для пустого/пробельного имени возвращает `""` — вызывающий сам решает,
 * что показать (иконку-заглушку, «?» и т. п.).
 */
fun avatarInitials(name: String?): String {
    if (name.isNullOrBlank()) return ""
    return name.trim().split(" ", limit = 2)
        .mapNotNull { it.firstOrNull()?.uppercase() }
        .joinToString("")
        .take(2)
}
