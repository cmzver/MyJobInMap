# Changelog

Генерируется из истории коммитов: `server\venv\Scripts\python.exe scripts\changelog.py`.
Руками не редактировать — источник правды это сообщения коммитов
([conventional commits](https://www.conventionalcommits.org/ru/)).
Планы — в [ROADMAP.md](ROADMAP.md).

## Октябрь 2026

### Новое

- **portal**: колонка «Кем заведена» и правки аватаров/realtime (d26c74e)
- **portal**: унифицировать состояния загрузки данных (5df90b1)
- **portal**: добавить мобильную навигацию исполнителя (7de1b55)
- **portal**: связать сводки со списком заявок (72c757d)
- **portal**: улучшить фильтры и сохранённые виды (60ea707)

### Исправления

- **android**: надёжный офлайн-outbox и обновлённая карточка заявки (d11a6d1)
- **server**: закрыть находки технического аудита A01–A14 (0c2412c)

### Рефакторинг

- **portal**: split task list presentation (de15205)
- **portal**: unify route and menu registry (aaafdce)

## Июль 2026

### Новое

- **addresses**: полноценная карточка адреса в Android (71aa96f)
- **serialization**: добавлен сериализатор для BigDecimal для поддержки @Contextual (c9f5e9b)

## Июнь 2026

### Новое

- **tasks**: auto-fill desired completion time from priority (912e815)
- **settings**: manage defect types from admin (add/edit/delete) (80e2804)
- add address assignees functionality for per-user access (d2ae10b)
- **tasks**: link tasks to address book, auto-propagate coordinate edits (726d2aa)
- **intercom**: sort panels by entrance, denser list (fc4f88b)
- **deploy**: -WireGuard flag layers the WG overlay into every compose call (deca12f)
- **intercom**: prod WireGuard overlay for postgres stack + env docs (b0fd9d2)
- **intercom**: phase 2.5 — on-demand WireGuard access to panels (3d480d7)
- **intercom**: phase 3+4 — portal UI for intercom panels (6b253bd)
- **intercom**: phase 2 — Beward driver, live control endpoints, audit (79a9336)
- **intercom**: phase 1 — intercom panels data model + CRUD (5adef68)
- **chat**: web push to online users too; SW suppresses when focused (810ddf1)
- **chat**: mentions go to the notification center, not just toasts (78c2740)
- **chat**: discuss-from-task button + system message on status change (6a6225e)
- **portal/chat**: web push subscription + service worker (e61bc75)
- **server/chat**: web push backend (VAPID) for offline delivery (e7c5338)
- **portal/chat**: global message search UI (d10a1f2)
- **server/chat**: Postgres FTS search + global message search (f92967e)
- **chat**: reconnect-sync catch-up + drop polling (2942b3f)
- **server/backup**: drive scheduler from UI settings (auto/schedule/retention) (d91dfff)
- **chat**: atomic message-with-attachment endpoint (707d227)
- **portal/chat**: optimistic message send with retry (c7bf91d)
- **portal/chat**: mute-aware toasts + highlighted mention toast (1e18397)
- добавлены новые файлы в .gitignore для исключения локальных настроек и конфигураций (16ce554)
- **portal**: extend redesign to dashboards, profile, orgs, modals (06bb1cb)
- **portal**: redesign task screens — one accent, less noise (7d75502)
- **monitoring**: host (node-exporter) Grafana dashboard (2137db5)
- **system**: container log viewer + Grafana access from the panel (07bb3fd)
- **monitoring**: provision Prometheus/Grafana/node-exporter via -Monitoring (64148b8)
- **system**: superadmin server-health panel with container status (214e773)
- **settings**: wire custom-fields builder to real API (c5231dd)
- full Docker stack (PG) + tests through Docker (#22)
- PostgreSQL backups (pg_dump/pg_restore) via dialect-aware backend (#19)
- SQLite→PostgreSQL ETL script for DB migration (#18)
- make DB layer PostgreSQL-ready (dialect fixes + PG test matrix) (#17)
- background task queue (ARQ/Redis) + business metrics + PG migration ADR (#16)
- **server**: fold admin response into support status-change comment (18bbc6c)
- **portal**: unify page headers and add settings UI primitives (981c062)
- **security**: IP ban, brute-force & DDoS protection with admin panel (aa7acdd)
- **deploy**: provision fresh servers + unify env files (82c517f)
- **android**: open the full task screen from a chat task card (6653b76)
- **android**: show task details on the object card, not just the address (5aabc19)
- **chat**: consolidate file/task attach into a single + menu (7ea2ed7)
- **chat**: attach a Task to chat messages with quick navigation (559a64f)

### Исправления

- **portal**: proportional column resize + reliable auto-stretch on tasks table (de4235e)
- **geocoding**: resolve bare adjective street names via "улица" fallback (c1518c7)
- **deploy**: preset targets current prod, enables WireGuard, no env clobber (17cc821)
- **server**: serialize server timestamps as UTC (Z) so clients show local time (b6fd0cf)
- **portal/chat**: keep chat input in view, stop page overflow (06e6640)
- **deploy**: SSH keepalive, skip ControlMaster on Windows, expose /health (dab53e8)
- **portal**: de-emerald the "Вы" self chip in chat members (b604df7)
- **portal**: wrap long MetricCard labels on narrow viewports (c770db9)
- **portal**: de-sky admin avatar ring in chat settings (2ce47ff)
- **portal**: let superadmin pick an organization when managing groups (219a0ab)
- **deploy**: provision PostgreSQL stack by default (e5599b4)
- **settings**: make TaskDefaults priority select functional (b3ea096)
- **settings**: correct broken bool toggles + priority option mismatch (27bf699)
- PG backups work when server runs on host without pg_dump (docker exec) (#21)
- **server**: ban IPv6 by /64 so subnet rotation can't evade the guard (4b51e36)
- **server**: stop deleting the login-failure audit journal on success (17601d0)
- **server**: never auto-ban loopback/private IPs (IP-guard self-DoS) (13d2f72)
- **android**: guard against non-primitive WS "type" in ChatRealtimeClient (01b6cf8)
- **android**: report-settings uses PATCH, not PUT (0a164ee)
- **server**: backup settings 500 — get_setting returns typed bool, not str (f3854c5)
- restore run_no_reload.py and _fix_db.py (referenced outside .py) (cefb1db)
- **portal**: drop deprecated baseUrl from tsconfig (a2a93dd)
- **ci**: green the CI pipeline (black/isort format + fix pre-existing test failures) (53c73eb)
- **android-map**: color task markers by priority, not status (6621235)

### Производительность

- **server/chat**: add composite index messages(conversation_id, id) (90773d7)
- **server/chat**: batch-load messages & conversations to kill N+1 (9801213)
- **server/ws**: offload sync DB to threadpool, cache members for typing (fed4a6e)
- **chat**: patch query cache from WS events instead of refetch (561e17d)

### Рефакторинг

- **portal**: drop duplicate personal Settings page, fold into Profile (49c2c8f)
- **portal**: download backups via apiClient instead of raw fetch (cc64dbb)
- **models**: drop unused CustomFieldValueModel (d78ae96)
- **settings**: remove non-functional card-layout builder (189b390)
- **bot**: dedup auth-retry + non-blocking I/O in async handlers (e8aee12)
- remove SQLite-only DB maintenance ops (unsupported on PG) (b6d696b)
- extract create_db_engine as explicit DB-mode switch + tests (#20)
- **server**: migrate ORM models to SQLAlchemy 2.0 Mapped[] typing (9674fb8)
- **android**: migrate realtime + chat cache JSON off Gson (82ea88e)
- **android**: migrate report-settings to generated OpenAPI models (04954e9)
- **android**: migrate Chat domain to generated OpenAPI models (021778b)
- **android**: migrate Addresses domain to generated OpenAPI models (ee777c9)
- **android**: migrate Tasks + Device domains to generated OpenAPI models (5a9b058)
- **android**: migrate Auth + Users domains to generated OpenAPI models (460d8c1)
- **android**: migrate Update domain to generated OpenAPI models (638aa6a)
- **android**: migrate JSON serialization Gson -> kotlinx.serialization (4e88dc5)
- **api**: move user stats into UserService; thin users router (af56ee8)
- **api**: split admin/misc.py into domain routers (115ffc2)
- **api**: extract SettingsService; thin settings router (1b4bda9)
- **api**: extract DatabaseService; split db-tools into admin/database.py (6f45536)
- **api**: extract PhotoService; thin photo endpoints (0191070)
- **api**: extract UpdateService; thin updates endpoints (1eb59b5)
- **api**: split auth router into app/api/auth package (1cefed2)
- **api**: extract NotificationService; thin notification endpoints (deedabe)
- **api**: extract SupportService; thin support endpoints (2cb4a70)
- **api**: split chat router into app/api/chat package (5c1cde5)
- **api**: split tasks router into app/api/tasks package (09d503d)
- **api**: extract BackupService; thin backup endpoints (0e83a15)
- **api**: extract user CRUD into UserService; thin admin/users router (1de0222)
- **api**: group address endpoints into app/api/addresses package (ab005a0)
- **api**: group analytics endpoints into app/api/analytics package (083af8a)
- **api**: group admin endpoints into app/api/admin package (9757688)
- **api**: de-duplicate user CRUD; users.py is read-only alias (cb104d9)
- **api**: collapse vestigial v2 into v1; move task summary to TaskService (c6d93fe)
- **portal**: derive Address types from OpenAPI; enum-type schema fields (3858bad)
- **analytics**: type SLA response + derive portal SLA/analytics types (7921893)
- **portal**: derive Reports types from OpenAPI schema (8c5aa38)
- **chat**: derive portal chat types from OpenAPI; fix list drift (4c4ef30)
- **portal**: derive Organization types from OpenAPI schema (be2b5fc)
- **support**: derive portal support types from OpenAPI schema (a0e0acf)
- derive Comment & User portal types from OpenAPI; enum-type role (59d4986)
- **portal**: derive Task model and domain enums from OpenAPI schema (398efaf)
- **server**: enum-type task write-side + add OpenAPI dump script (b99b686)
- **portal**: UpdateTaskData = Partial<CreateTaskData> (a5366eb)
- **server**: consolidate task schemas, type status/priority as enums (7ac3713)

## Май 2026

### Новое

- **tasks**: collapse filter controls behind a toggle on mobile (f9533b0)
- **tasks**: card layout for the task list on mobile/tablet (31ecd4e)
- **map**: filter by all statuses, priority and assignee (990cecb)
- **map**: zoom-aware clustering and stop view from resetting (761fea0)
- add new database schema version 4 with tasks, comments, and pending actions tables (50d40b0)

### Исправления

- **portal**: repair corrupted Cyrillic 'И' in UI labels and comments (1828e8a)
- **map**: show all active tasks and color markers by priority (9a1d6f7)
- **tasks**: don't turn plain dispatcher chatter into tasks (f64a8ee)
- **tasks**: make explicit date sort pure, drop unread-notification float (aa0674c)

## Апрель 2026

### Новое

- Add Gradle wrapper and scripts for project setup (4e6bbf8)
- Refactor admin settings panel and update notification system (e103627)
- добавление поддержки HTTPS с использованием Caddy и автоматическим обновлением сертификатов (cdcbc7f)
- улучшение управления маппингами в настройках Telegram-бота (56e0de4)
- добавление управления известными группами для Telegram-бота (17cc793)
- add Telegram bot settings management (f16f505)

## Март 2026

### Новое

- add RealtimePushService for WebSocket notifications (daae287)
- Add `__init__.py` to the models package to export all models, enums, and related utilities. (93f4853)
- add support ticket system with API, models, and database migrations (0fb6337)
- implement unified analytics API with frontend integration (47740b1)
- Implement chat UI enhancements and new components (dffcd8b)
- Implement Alembic migration management in base model (6c27318)
- Добавить валидацию задачи и соответствия организации при создании чата заявки (2ee64ab)
- Implement chat conversation management features and websocket updates (dd597ed)

### Исправления

- improve user authentication and permission checks with safer attribute access (21eb2ba)

### Рефакторинг

- improve layout and responsiveness in various pages (edddec0)
