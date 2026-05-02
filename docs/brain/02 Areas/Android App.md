# Android App

## Назначение

`app/` — текущее Android приложение для исполнителей с Compose, MVVM и offline-first подходом.

## Смотреть сначала

- [app/src/main/java/com/fieldworker](../../app/src/main/java/com/fieldworker)
- [app/build.gradle.kts](../../app/build.gradle.kts)
- [README.md](../../README.md)

## Основные темы

- Clean Architecture: data, domain, ui
- Hilt DI
- Room и offline-first синхронизация
- статусные переходы задач
- карта и фото-доказательства

## Связанные заметки

- [[01 Maps/Project Map]]
- [[02 Areas/Mobile Next]]

## 2026-04-22 Reliability Fixes

- `LoginViewModelTest` синхронизирован с новым конструктором `LoginViewModel` (добавлен `Application` в тестовые инстансы).
- `FCMService.onNewToken()` теперь делает попытку серверной регистрации токена для уже авторизованного пользователя.
- При logout в `MainActivity` добавлена best-effort попытка `unregisterDevice()` перед очисткой auth.
- В `AndroidManifest.xml` добавлены `queries` для Yandex Maps, Yandex Navigator, Google Maps и 2GIS, чтобы избежать проблем package visibility на Android 11+.

Проверка:

- `:app:assembleDebug` — OK
- `:app:lintDebug` — OK, предупреждение `QueryPermissionsNeeded` исчезло
- `:app:testDebugUnitTest --tests com.fieldworker.ui.auth.LoginViewModelTest` — OK
- Полный `:app:testDebugUnitTest` все еще падает в `MapViewModelTest` (NPE), это отдельный существующий блок проблем.