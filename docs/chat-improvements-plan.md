# План улучшений чатов на портале

> Рабочий документ. Создан 2026-06-25. Источник — анализ realtime/данных чата.
> Цель: убрать паразитную нагрузку realtime-слоя, ускорить бэкенд, поднять UX, добавить интеграции.
> Реализация поэтапно, **каждая фаза = отдельный PR с верификацией и коммитом**. Не сваливать всё в один диск.

---

## Kickoff-промт (вставить при старте)

```
Продолжаем работу по docs/chat-improvements-plan.md.
Начинаем с Фазы 1 (WS-патч кэша + снятие polling). Правила:
— работаю автономно как senior, без вопросов по ходу, отвечаю по-русски;
— одна фаза = один логический коммит на ветке feat/chat-realtime-optimizations;
— перед коммитом: build-linter (portal: eslint+tsc; server: black+isort+pytest), фиксы л── зелёные;
— не менять контракт API без явной пометки в плане; payload broadcast'ов уже полный;
— после каждой фазы: краткий отчёт (что сделано, замеры/проверка) и отметка [x] в туду этого файла.
Контекст уже изучен: useChat.ts, useWebSocket.ts, ChatPage.tsx, websocket.py,
websocket_manager.py, chat_service.py. Codegraph — основной инструмент навигации.
```

---

## Архитектурные инварианты (не нарушать)

- `broadcast_chat_message` уже шлёт **полный** payload сообщения → на клиенте можно `setQueryData`, рефетч не нужен.
- Структура ключей кэша: `['chat','messages',convId]` (infinite), `['chat','conversations',includeArchived]`, `['chat','conversation',id]`.
- WS-события приходят всем участникам **кроме отправителя** (`exclude_user_id`) — отправитель обновляет своё состояние сам через onSuccess мутации.
- Tenant/membership проверки на бэке трогать нельзя — только производительность.
- Контракт OpenAPI: если меняется schema ответа/эндпоинт → регенерация типов портала (и Android — отдельный follow-up, не блокер).

---

## ФАЗА 1 — Realtime: патч кэша вместо инвалидации + снять polling  ✅ ВНЕДРЕНО (commit 561e17d)

> Готово: `chatCache.ts` + WS-патчи (message/edited/deleted), трекинг активного чата,
> `chat_read` не инвалидирует список, polling ослаблен до fallback (msgs 30s / convs 60s).
> Реакции оставлены на invalidate (payload без `user_names`) — follow-up.
> Вложения: edited-broadcast несёт полное сообщение → получатель видит вложение без рефетча.

**Проблема:** `useWebSocket` на каждое событие делает `invalidateQueries` → полный рефетч истории у всех участников; плюс `refetchInterval` дублирует WS.
**Файлы:** [useWebSocket.ts](../portal/src/hooks/useWebSocket.ts), [useChat.ts](../portal/src/hooks/useChat.ts), [ChatPage.tsx](../portal/src/pages/ChatPage.tsx)

- [ ] Убрать `refetchInterval: 10_000` из `useMessages`; в `useConversations` `refetchInterval: 15_000` → либо убрать, либо поднять до 60_000 как fallback.
- [ ] `chat_message`: вместо invalidate — `setQueryData(['chat','messages',convId])` вставкой нового сообщения в последнюю страницу infinite-кэша (с дедупом по `id`, на случай гонки с рефетчем). Обновить превью в `conversations` через `setQueryData` (last_message + bump сортировки), без рефетча.
- [ ] `chat_message_edited` / `chat_message_deleted` / `chat_reaction`: точечный патч соответствующего сообщения в кэше вместо invalidate.
- [ ] `chat_read`: оставить лёгкую инвалидацию conversations ИЛИ патч `unread_count`; read-receipt листенер не трогать.
- [ ] Вынести логику патча в хелперы (напр. `portal/src/utils/chatCache.ts`), чтобы `handleMessage` не разрастался.
- [ ] Edge-cases: событие для **не открытого** чата (convId ≠ активный) — патчить кэш списка, но не messages, если страницы не загружены (проверять `getQueryData`).

**Проверка:** два браузера/два юзера, обмен сообщениями — приходит мгновенно, без рефетч-запросов в Network (кроме отправителя). Прокрутка истории не ломается. Реакции/правки/удаления синхронны.
**Коммит:** `perf(portal/chat): patch query cache from WS events, drop polling`

---

## ФАЗА 2 — Backend: устранить N+1 в горячих запросах  ✅ ВНЕДРЕНО

> Готово: `_build_message_responses` (батч на всю страницу: reply/вложения/реакции/
> упоминания/заявки/пользователи — по одному IN-запросу); `_build_message_response`
> стал тонкой обёрткой. `get_user_conversations` переписан на агрегаты с `GROUP BY`
> и батч-загрузку (last-message по `max(id)`, unread/mentions через `or_` per-conv
> порогов, собеседники direct и их аватары — батчем). 87 chat-тестов зелёные.

**Проблема:** `_build_message_response` — ~6 запросов на сообщение (стр.50 → 300+ SQL); `get_user_conversations` — ~5 запросов на чат в цикле.
**Файлы:** [chat_service.py](../server/app/services/chat_service.py)

- [ ] `get_messages`: батч-сборка страницы. Один запрос на senders (`UserModel.id IN ids`), один на attachments, один на reactions, один на mentions(+users) для всех id страницы; `_build_message_response` переписать на сборку из словарей (или сделать `_build_message_responses(db, msgs)` батч-версию).
- [ ] reply-preview: собрать `reply_to_id`-ы страницы и подгрузить reply-сообщения + их sender'ов одним заходом.
- [ ] attached task: батч-загрузка задач по `task_id IN (...)`.
- [ ] `get_user_conversations`: unread_count и unread_mention_count — агрегирующими запросами с `GROUP BY conversation_id` вместо цикла; last_message — один запрос (оконная функция / коррелированный по `last_message_at`), sender'ы last-сообщений — батч.
- [ ] Сохранить идентичный JSON-ответ (схемы не меняются) — это чисто внутренний рефактор.

**Проверка:** залогировать кол-во SQL (echo / счётчик) до/после на чате с 50+ сообщениями и юзере с 10+ чатами; pytest по чату зелёный; ответ побайтово эквивалентен (snapshot-сравнение).
**Коммит:** `perf(server/chat): batch-load messages & conversations to kill N+1`

---

## ФАЗА 3 — WS-хендлер: не блокировать event loop  ✅ ВНЕДРЕНО (commit fed4a6e)

> Готово: `chat_typing`/`chat_read` через `run_in_threadpool`; состав чата для typing
> из TTL-кэша (30s) с проверкой членства по нему же.

**Проблема:** в [websocket.py](../server/app/api/websocket.py) `chat_typing`/`chat_read` делают синхронный `db.query` прямо в async-цикле; typing прилетает почти на каждый keystroke.
**Файлы:** [websocket.py](../server/app/api/websocket.py), возможно [chat_service.py](../server/app/services/chat_service.py)

- [ ] Sync-DB операции в хендлере обернуть в `run_in_threadpool` (`from fastapi.concurrency import run_in_threadpool`).
- [ ] Список участников чата для typing — кэшировать (TTL-память в `ws_manager` или простой dict с инвалидацией по `chat_conversation_updated`), не ходить в БД на каждый typing.
- [ ] `chat_read` через WS: оставить запись, но без блокировки loop; убедиться, что дублирование с REST `mark_as_read` не создаёт лишних broadcast'ов.

**Проверка:** нагрузочно (несколько соединений, активный typing) — loop отзывчив; ручной тест typing-индикатора и read-receipt не сломан.
**Коммит:** `perf(server/ws): offload sync DB to threadpool, cache chat members for typing`

---

## ФАЗА 4 — UX уведомлений: уважать mute/активный чат + бейдж непрочитанных  ✅ ВНЕДРЕНО

> Готово: тост `chat_message` подавляется для активного И замьюченного чата
> (`isConversationMuted` по кэшу); личное упоминание тостится даже в mute-чате и с
> выделенным текстом. Бейдж непрочитанных и mention-бейдж в навигации уже были
> (`DashboardLayout` суммирует `unread_count`/`unread_mention_count`) — теперь они
> обновляются в реальном времени за счёт патча кэша из Фазы 1.

**Файлы:** [useWebSocket.ts](../portal/src/hooks/useWebSocket.ts), навигация ([DashboardLayout.tsx](../portal/src/layouts/DashboardLayout.tsx)), [ChatPage.tsx](../portal/src/pages/ChatPage.tsx)

- [ ] Тост на `chat_message` НЕ показывать, если: чат сейчас открыт (активный convId) ИЛИ чат в mute. Нужен доступ к активному convId и mute-флагам из WS-слоя (общий стор/ref активного чата).
- [ ] Вместо toast-спама — глобальный счётчик непрочитанных: сумма `unread_count` по conversations → бейдж на пункте «Чаты» в навигации.
- [ ] Упоминания (`unread_mention_count`) выделять сильнее (бейдж/звук опционально).

**Проверка:** открытый чат не тостит; mute-чат молчит; бейдж в навбаре растёт/обнуляется корректно.
**Коммит:** `feat(portal/chat): mute-aware toasts + unread badge in nav`

---

## ФАЗА 5 — Оптимистичная отправка + единый upload вложений

**Файлы:** [useChat.ts](../portal/src/hooks/useChat.ts), [ChatPage.tsx](../portal/src/pages/ChatPage.tsx), бэкенд attachments ([attachments.py](../server/app/api/chat/attachments.py)) — опционально единый multipart-эндпоинт.

- [ ] `useSendMessage`: `onMutate` вставляет оптимистичное сообщение со статусом `sending`; `onError` → пометить `failed` + кнопка «повторить»; `onSuccess` → заменить временный id реальным (дедуп с возможным WS-эхо).
- [ ] Вложения: либо новый эндпоинт «сообщение+файл одним multipart», либо в текущем двухшаговом — откат draft при ошибке upload (удалять сироту). Предпочтительно единый эндпоинт.
- [ ] Прогресс загрузки файла в UI.

**Проверка:** на throttled-сети сообщение появляется мгновенно; ошибка отправки → retry; нет пустых сообщений-сирот при сбое upload.
**Коммит:** `feat(portal/chat): optimistic send + atomic attachment upload`

---

## ФАЗА 6 — Web Push (доставка при закрытой вкладке)

**Файлы:** новый service worker в `portal/public/`, регистрация в portal, бэкенд — хранение подписок + отправка (VAPID), точка вызова — там же где `broadcast_chat_message`/`notification_service`.

- [ ] Service worker + регистрация Push API на портале (запрос разрешения в настройках чата, не навязчиво).
- [ ] Бэкенд: таблица push-подписок (endpoint, ключи), эндпоинт subscribe/unsubscribe, VAPID-ключи в конфиге.
- [ ] Отправка web-push на новое сообщение/упоминание для оффлайн-участников (у кого нет активного WS), уважая mute.
- [ ] Дедуп с Android-push (не дублировать тому же юзеру на том же девайсе) — best-effort.

**Проверка:** закрытая вкладка → приходит системное уведомление; клик открывает нужный чат; mute уважается.
**Коммит:** `feat(chat): web push notifications for offline delivery`

---

## ФАЗА 7 — Поиск: FTS5 + глобальный поиск

**Файлы:** миграция БД (FTS5 virtual table), [chat_service.py](../server/app/services/chat_service.py) `search_messages`, новый эндпоинт глобального поиска, портал — UI глобального поиска.

- [ ] FTS5-таблица по `messages.text`, синхронизация триггерами (insert/update/delete).
- [ ] `search_messages` перевести на FTS-MATCH (с tenant/membership фильтром).
- [ ] Новый эндпоинт «поиск по всем моим чатам» + UI на портале (результаты с переходом к сообщению).
- [ ] Реконнект-sync (если в Фазе 1 убрали polling): на `onopen` — «отдай сообщения новее last_seen_id» по активному/всем чатам, чтобы не терять пропущенное. (Можно вынести в отдельный мини-PR перед удалением polling.)

**Проверка:** поиск быстрый на большом объёме; глобальный поиск находит по всем чатам; после реконнекта пропущенные сообщения подтягиваются.
**Коммит:** `feat(chat): FTS5 search + global message search`

---

## ФАЗА 8 — Интеграции (по отдельности, каждая — свой PR)

- [ ] **Telegram-бридж:** через существующий бот — уведомление о сообщении/упоминании в TG + ответ оттуда в чат.
- [ ] **Чат-из-заявки:** кнопка «Обсудить» в заявке → создать/открыть чат по задаче; системные сообщения в чат при смене статуса заявки (инфраструктура `message_type='system'` + broadcast уже есть).
- [ ] **Центр уведомлений:** гнать упоминания/важное через `notification_service` в общий колокольчик, не только toast.

**Коммиты:** по одному на интеграцию.

---

## Глобальный порядок и зависимости

1. **Фаза 1 + Фаза 3** — первыми (низкая стоимость, снимают основную нагрузку). Можно одним PR или двумя.
2. **Фаза 2** — усиливает эффект Фазы 1 (рефетчей меньше И они дешевле).
3. **Фаза 4** — быстрый UX-выигрыш.
4. **Фаза 5** — заметность скорости.
5. **Reconnect-sync** (из Фазы 7) — обязательно ДО окончательного удаления polling, если оно ещё было fallback'ом.
6. **Фаза 6 / 7 / 8** — по приоритету продукта.

## Definition of Done (для каждой фазы)
- build-linter зелёный (portal: eslint+tsc; server: black→isort→pytest cov≥50).
- Ручная проверка сценария из раздела «Проверка».
- Контракт API не сломан (или типы перегенерированы).
- Отметка [x] в этом файле + краткий отчёт.
