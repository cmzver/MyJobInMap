# Changelog

Все значимые изменения проекта документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).


## [Unreleased]


## [2.14.2] - 2026-03-16

### Изменено
- **Android task filters** — список заявок в приложении теперь корректно применяет локальные фильтры, поиск и сортировку даже при включённом Paging.
- **Android filters UI** — панель фильтров сделана компактнее: уменьшены отступы, снижена высота чипов и добавлен счётчик активных фильтров.
- **Project version** — версия Android-приложения и API повышена до `2.14.2` (`versionCode = 21402`).

### Проверено
- **Android build** — `:app:assembleDebug` и `:app:compileDebugKotlin` проходят успешно после исправления фильтров.


## [2.14.1] - 2026-03-16

### Изменено
- **Android update flow** — автопроверка обновлений выполняется при возврате приложения в foreground, а ручная проверка вынесена в настройки Android-приложения.
- **Публикация APK** — сервер извлекает `versionName` и `versionCode` напрямую из `AndroidManifest.xml` внутри APK, а портал больше не требует ручного ввода этих значений.
- **Android app version** — версия мобильного приложения синхронизирована с текущим релизом проекта: `2.14.1`.
- **State machine статусов** — портал, сервер, workspace и Android теперь используют единые правила переходов без возврата из `DONE` и `CANCELLED` в активные статусы.
- **Android статус-диалог** — приложение показывает только допустимые переходы статуса и не предлагает повторно открыть финальные заявки.

### Исправлено
- **Сессия после обновления APK** — улучшено восстановление auth-данных после обновления приложения поверх установленной версии.
- **История обновлений в админке** — тесты updates API изолированы от реального каталога `server/uploads/apk` и больше не удаляют опубликованные версии после прогона `pytest`.
- **Валидация релизов** — загрузка APK с `versionCode`, не превышающим текущую опубликованную версию, отклоняется в UI и на сервере.
- **Смена статуса заявок** — для переходов в `DONE` и `CANCELLED` комментарий обязателен во всех клиентах, а тексты и ошибки синхронизированы между Android, portal, workspace и API.


## [2.14.0] - 2026-02-17

### Phase 10.1 — Организации: полная интеграция

#### Добавлено
- **TenantFilter в API** — multi-tenant изоляция данных во всех ключевых роутерах:
  - `tasks` — фильтрация заявок + привязка org_id при создании
  - `addresses` — фильтрация адресов (список, поиск, find-by-components)
  - `dashboard` — статистика и активность по организации
  - `reports` — аналитика по организации
  - `finance` — финансовая статистика по организации
  - `admin_users` — список пользователей и работников по организации
- **organization_id в response-схемах** — `TaskResponse`, `TaskListResponse`, `UserResponse`
- **Реактивация организаций** — `POST /api/admin/organizations/{id}/activate`
- **Отвязка пользователя** — `POST /api/admin/organizations/{id}/unassign-user`
- **Пользователи организации** — `GET /api/admin/organizations/{id}/users`
- **OrganizationDetailPage** — детальная страница с вкладками:
  - Информация (email, телефон, адрес, лимиты)
  - Пользователи (таблица, добавление/удаление)
- **Кликабельные названия** в OrganizationsPage → переход на детальную страницу
- **Кнопка реактивации** для неактивных организаций в списке

#### Изменено
- `_base_task_dict` и `user_to_response` в `utils/__init__.py` — включают `organization_id`
- `OrganizationsPage` — добавлена навигация, реактивация, `useActivateOrganization`
- `useOrganizations.ts` — новые хуки: `useOrganizationUsers`, `useActivateOrganization`, `useUnassignUser`
- `organizationsApi.ts` — новые методы: `activateOrganization`, `unassignUser`, `getOrganizationUsers`

---

## [2.13.0] - 2026-02-17

### Phase 10 — Масштабирование (Virtualization, Multi-tenant, API Versioning)

#### Добавлено
- **Виртуализация списков** (#47) — `@tanstack/react-virtual` в TasksPage:
  - Условная виртуализация при >40 строк (ROW_HEIGHT 56/44px, overscan 10)
  - Sticky header, scrollable container с maxHeight 720px
  - Селектор размера страницы (20/50/100 заявок)
  - Поддержка группировки: виртуализация работает с flat `group|task` массивом
- **API Versioning** (#80) — структура `/api/` и `/api/v2/`:
  - `/api/*` — основные эндпоинты (v1, backward compatible)
  - `/api/v2/version` — мета-информация о версиях API, deprecation status
  - `/api/v2/tasks/summary` — агрегированная статистика (by_status, by_priority, overdue, unassigned)
  - v2 envelope формат: `{data, meta: {api_version, timestamp, request_id}}`
- **Multi-tenant** (#79) — поддержка нескольких организаций:
  - `OrganizationModel` — модель организации (name, slug, limits, is_active)
  - `organization_id` FK в моделях User, Task, Address (nullable, backward compatible)
  - `TenantService` — CRUD для организаций (create, update, deactivate, assign_user)
  - `TenantFilter` — изоляция данных (apply/check_access/enforce_access/set_org_id)
  - `/api/admin/organizations` — REST API (list, create, get, update, deactivate, assign-user)
  - Superadmin (admin без org_id) — полный доступ, org-admin — только своя организация
  - Portal `OrganizationsPage` — таблица организаций, модалка создания/редактирования
  - Alembic миграция `20260217_0001_add_organizations_multi_tenant`

#### Тесты
- **55 новых тестов**:
  - TenantService: 16 тестов (slugify, CRUD, assign, limits, deactivation)
  - TenantFilter: 6 тестов (superadmin bypass, org isolation, access checks)
  - Organizations API: 18 тестов (CRUD, permissions, user assignment, inactive toggle)
  - API Versioning: 15 тестов (default endpoints, v2 meta, v2 summary, envelope, auth, backward compat)
- Server: **490 тестов** (435 + 55 новых)

#### Зависимости (Portal)
- `@tanstack/react-virtual@3` — виртуализация списков


## [2.12.0] - 2026-02-16

### Phase 8 (завершение) + Phase 9 (бизнес-функционал)

#### Добавлено
- **Prometheus мониторинг** (#70) — `prometheus-fastapi-instrumentator` для метрик FastAPI:
  - HTTP request rate, latency (p50/p95/p99), error rate, active requests
  - Эндпоинт `/metrics` для Prometheus scraping
  - `docker-compose.monitoring.yml` — Prometheus v2.51.0 + Grafana 10.4.0
  - Grafana dashboard (8 панелей: request rate, latency, errors, top endpoints)
  - Метрики исключают `/metrics`, `/health`, `/health/detailed`
- **SSL auto-renewal** (#72) — Caddy reverse proxy:
  - `Caddyfile` с автоматическим Let's Encrypt SSL
  - `docker-compose.ssl.yml` с Caddy 2-alpine
  - Security headers: HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy
  - WebSocket проксирование, gzip/zstd сжатие
- **WebSocket уведомления** (#74) — реал-тайм обновления на портале:
  - `ConnectionManager` — менеджер WebSocket-соединений (multi-tab, broadcast, per-user)
  - `/ws?token=JWT` эндпоинт с JWT аутентификацией и ping/pong heartbeat
  - Автоматический broadcast при создании/статусе/назначении/удалении заявок
  - Portal `useWebSocket()` hook — автоподключение, reconnect с backoff, React Query invalidation
  - WebSocket статус в `/health/detailed`
- **SLA дашборд** (#76) — мониторинг SLA:
  - `sla_service.py` — расчёт SLA метрик по приоритетам (PLANNED=168ч, CURRENT=48ч, URGENT=8ч, EMERGENCY=4ч)
  - `/api/sla` эндпоинт — overview, timing, by_priority, by_worker, trends
  - Portal `SlaPage` — 4 KPI карточки, таблицы по приоритетам/исполнителям, тренды с визуальными барами
  - React Query хук `useSla()` + фильтры по периоду
- **Экспорт в Excel** (#77) — xlsx экспорт заявок:
  - `excel_export.py` — openpyxl с форматированием (цвета статусов/приоритетов, zebra, freeze)
  - Два листа: «Заявки» (данные) + «Сводка» (статистика)
  - `/api/reports/export/excel` эндпоинт с фильтрами (period, status, priority, worker)
  - Portal `downloadExcel()` — скачивание xlsx файла

#### Тесты
- **44 новых теста** для всех фич:
  - SLA: 17 тестов (API auth/access, structure, periods, unit service)
  - Excel Export: 7 тестов (empty/data/filter, API auth, xlsx validation)
  - WebSocket Manager: 10 тестов (connect/disconnect, broadcast, send_to_user, cleanup)
  - WebSocket API: 3 теста (auth reject, valid connection, ping/pong)
  - Prometheus: 3 теста (endpoint, format, http_requests data)
  - Health: 1 тест (websocket status)
  - Прочие: 3 теста (event format, timestamp)
- Server: **425 тестов** (381 + 44 новых)

#### Зависимости
- `prometheus-fastapi-instrumentator==7.0.2` — Prometheus метрики
- `openpyxl==3.1.5` — Excel экспорт
- `websockets==14.2` — WebSocket поддержка (explicit)

#### Инфраструктура
- `monitoring/prometheus.yml` — конфигурация Prometheus
- `monitoring/grafana/` — Grafana dashboards + provisioning
- `docker-compose.monitoring.yml` — Prometheus + Grafana стек
- `docker-compose.ssl.yml` — Caddy reverse proxy
- `Caddyfile` — конфигурация Caddy


## [2.11.0] - 2026-02-15

### Инфраструктура — Phase 8 (DevOps)

#### Добавлено
- **Конфигурация через .env** (#73) — полный `.env.example` со всеми 30+ переменными окружения. Добавлены настройки: `RATE_LIMIT_MAX_ATTEMPTS`, `RATE_LIMIT_WINDOW_SECONDS`, `BACKUP_SCHEDULER_ENABLED`, `BACKUP_SCHEDULE_HOUR`, `BACKUP_SCHEDULE_MINUTE`, `BACKUP_RETENTION_DAYS` в `config.py`
- **Автоматические бэкапы** (#69) — `backup_scheduler.py` на APScheduler:
  - Ежедневный бэкап SQLite по расписанию (`BACKUP_SCHEDULE_HOUR:BACKUP_SCHEDULE_MINUTE`)
  - Авторотация: удаление бэкапов старше `BACKUP_RETENTION_DAYS`
  - Интеграция в lifespan (start/stop при запуске/остановке сервера)
  - Статус планировщика в `/health/detailed`
  - `get_scheduler_status()` API для диагностики
- **PostgreSQL поддержка** (#68) — верификация и улучшение:
  - `docker-compose.postgres.yml` обновлён: env_file, volumes, healthcheck, JSON логи
  - `psycopg2-binary` в requirements.txt
  - Alembic env.py поддерживает оба движка
  - Engine конфигурация: pool_pre_ping, pool_size, max_overflow для PostgreSQL
- **Staging environment** (#71) — `docker-compose.staging.yml`:
  - Отдельная PostgreSQL БД на порту 5433
  - API сервер на порту 8002 (не конфликтует с prod)
  - JSON логи, DEBUG уровень
  - Изолированные Docker volumes
- **21 тест** — конфигурация (7), rate limiter config (1), backup scheduler (12), health endpoint (1)

#### Изменено
- `docker-compose.yml` — добавлен `env_file` для конфигурации через `.env`
- `rate_limiter.py` — `login_rate_limiter` использует `RATE_LIMIT_*` из config вместо хардкода
- `requirements.txt` — добавлен `APScheduler==3.10.4`

#### Тесты
- Server: 381 тестов (360 + 21 новых)


## [2.10.0] - 2026-02-16

### Android — Phase 7 (завершение)

#### Добавлено
- **Navigation Compose** (#58) — `Screen.kt` sealed class с типобезопасными маршрутами. `MainScreen.kt` рефакторинг на `NavHost` + `NavController` с `saveState`/`restoreState` для bottom navigation
- **Paging 3** (#63) — полная интеграция:
  - `room-paging` зависимость для Room PagingSource
  - `TaskDao.getAllTasksPagingSource()` — постраничная выдача из Room
  - `OfflineFirstTasksRepository.tasksPagingFlow` — `Pager` с `PagingConfig(pageSize=30)`
  - `GetTasksUseCase.tasksPagingFlow` — проброс через UseCase
  - `MapViewModel.tasksPagingFlow` — `cachedIn(viewModelScope)`
  - `TaskListScreen` — поддержка `LazyPagingItems<Task>` с load state handling
- **Token Refresh** (#66) — полный flow обновления токенов:
  - Server: `/api/auth/refresh` endpoint с ротацией refresh token
  - Server: access token 24h, refresh token 30 дней
  - Android: `TokenAuthenticator` — OkHttp Authenticator для автоматического retry при 401
  - Android: `AppPreferences` — хранение refresh token
  - 8 серверных тестов для refresh endpoint

#### Изменено
- `AuthInterceptor` — logout только после неудачного refresh (не при первом 401)
- `TokenAuthenticator` — thread-safe с `synchronized`, защита от бесконечных циклов через `X-Refresh-Retry` header
- Access token expiry: 7 дней → 24 часа (компенсируется refresh token)

#### Тесты
- Server: 360 тестов (352 + 8 новых для token refresh)
- Android: 85 тестов (без изменений)


## [2.9.0] - 2026-02-15

### Android — Phase 7

#### Добавлено
- **Version Catalogs** — `gradle/libs.versions.toml` для централизованного управления 40+ зависимостями. `build.gradle.kts` (root + app) мигрированы на `libs.*` ссылки
- **Certificate Pinning** — `CertificatePinner` в `NetworkModule.kt` с конфигурируемой картой доменов для production
- **ProGuard правила** — расширенные правила для Retrofit, Gson, OkHttp, Hilt/Dagger, Room, Firebase, Compose, Coil, WorkManager, sealed classes. `isMinifyEnabled=true` для release
- **Unit тесты** — 85 Android тестов:
  - `LoginViewModelTest` — 16 тестов (инициализация, валидация, login/logout, loading state)
  - `MapViewModelTest` — 37 тестов (сессия, задачи, фильтры, сортировка, сеть, комментарии, статусы, фото)
  - `OfflineFirstTasksRepositoryTest` — 32 теста (исправлены для PaginatedResponseDto)
- **Kotlin `all-open` плагин** — `@Singleton` классы становятся `open` для MockK subclass-мокинга
- **JVM args для тестов** — `--add-opens` и `-XX:+EnableDynamicAgentLoading` для MockK на JDK 21

#### Техническое
- `AppPreferences` в тестах: реальный экземпляр с фейковым `SharedPreferences` (HashMap-хранилище) вместо MockK mock — обход ограничения MockK agent на JDK 21 для final-классов
- `mockk-agent` добавлен как явная зависимость

#### Уже было реализовано (обнаружено при анализе)
- #59 Error handling — `NetworkError` sealed class + Kotlin `Result<T>`
- #61 Offline-first — `OfflineFirstTasksRepository` + `PendingAction` + `SyncWorker`
- #62 Pull-to-refresh — `PullToRefreshBox` в `TaskListScreen`
- #64 Dark theme — Light/Dark `ColorScheme` в `Theme.kt`


## [2.8.0] - 2026-02-14

### Тестовое покрытие (Phase 6)
- Добавлено:
  - **test_admin_backups_api.py** — 24 теста: CRUD бэкапов, path traversal защита (6 кейсов), backup settings, DB stats/integrity/cleanup
  - **test_push_service.py** — 9 тестов: init_firebase, send_push_sync, send_push_notification, background (всё с mock Firebase)
  - **test_admin_api.py** расширен — +7 тестов: workers endpoint, user stats extended, role change
  - **test_addresses_api.py** расширен — +15 тестов: autocomplete (cities/streets/buildings/entrance), compose, find_by_components, deactivate, filters
  - **test_rate_limiter.py** расширен — +8 тестов: thread safety (20 потоков), MAX_TRACKED_IPS overflow, edge cases
  - **test_image_optimizer.py** расширен — +7 тестов: zero_byte, unknown_ext, aspect_ratio, P_mode, pillow_not_available fallback, webp
  - **Portal: Vitest** — 44 unit-теста: `dateFormat.ts` (22), `cn.ts` (7), `apiError.ts` (11), `getSla` (9)
- Исправлено:
  - **Баг `set_setting()`** — функция не поддерживала upsert и не принимала `description`/`group` kwargs. Backup settings PATCH падал при отсутствии настройки в БД. Исправлено: upsert с поддержкой `label`, `description`, `group`
  - **`test_set_setting_nonexistent`** — обновлён для нового upsert-поведения
- Итого:
  - Сервер: **282 → 352 тестов** (+70)
  - Портал: **0 → 44 теста** (Vitest)


## [2.7.0] - 2026-02-14

### Портал UX и архитектура (Phase 5)
- Добавлено:
  - **Единый API error handler** (`utils/apiError.ts`) — `getApiErrorMessage`, `showApiError`, `showApiSuccess`, `mutationToast` с приоритетной цепочкой извлечения ошибок (detail → error → message → HTTP status → fallback). 9 страниц обновлено
  - **Skeleton loading components** (`components/Skeleton.tsx`) — 7 компонентов вместо спиннеров: `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonTable`, `SkeletonTaskList`, `SkeletonStats`. Интегрировано в Dashboard, Tasks, Users
  - **API response types** (`types/api.ts`) — `ApiMessage`, `ApiErrorResponse`, `HealthResponse`, `ApiOperationResult`
  - **Task type completeness** — `is_remote: boolean`, `completed_at: string | null` добавлены в интерфейс `Task`
  - **Image lazy loading** — `loading="lazy"` для фото задач в TaskDetailPage
  - **Strict TypeScript** — `noUncheckedIndexedAccess: true` в tsconfig.json
- Исправлено:
  - ~60 TypeScript ошибок после включения `noUncheckedIndexedAccess` (Modal, TaskForm, AddressForm, MapPage, DashboardPage, TasksPage, Autocomplete)
- Подтверждено:
  - Optimistic updates уже реализованы в `useTasks.ts`
  - React.lazy code splitting уже реализовано в App.tsx (18 страниц)
  - react-hook-form уже интегрирован в формы


## [2.6.0] - 2026-02-14

### Серверная надёжность (Phase 4)
- Добавлено:
  - **Global exception handler** — JSON 500 вместо stack trace для непойманных исключений
  - **Validation error handler** — унифицированный формат `{ error, details[], request_id }`
  - **Request ID middleware** — уникальный `X-Request-ID` заголовок для трассировки запросов
  - **Audit log** (`app/services/audit_log.py`) — логирование login, user CRUD, backup CRUD
  - **File upload MIME validation** — проверка magic bytes (JPEG/PNG/WebP), не только расширения
  - **DB indexes** — `ix_tasks_created_at`, `ix_tasks_completed_at` для ускорения dashboard/finance запросов
- Исправлено:
  - **N+1 query в dashboard** — `joinedload(assigned_user)` для срочных заявок вместо отдельных запросов
  - **N+1 query в finance** — SQL агрегация `func.sum(case(...))` вместо загрузки всех задач каждого работника
  - **Geocoding cache** — TTL 24ч с вытеснением по времени вместо FIFO без лимита
- Проверено:
  - **SQL injection аудит** — все raw SQL вызовы (VACUUM/ANALYZE/PRAGMA/SELECT 1) без пользовательского ввода
  - **Structured logging** — JSON формат уже доступен через `LOG_FORMAT=json`

### TypeScript строгость портала (Phase 3)
- Исправлено:
  - `SystemSelector.tsx` — удалено обращение к `system.model` (свойство принадлежит `AddressEquipment`)
  - `AdminSettingsPage.tsx` — `Boolean()` type guard для `SettingValue` → `boolean`
  - `TaskDetailPage.tsx` — `task.amount` → `task.payment_amount`


## [2.5.0] - 2026-02-14

### Безопасность и инфраструктура (Phase 1)
- Добавлено:
  - **GitHub Actions CI/CD** — линтинг, тесты, сборка портала (`.github/workflows/ci.yml`)
  - **Docker**: healthcheck, `.dockerignore`, non-root user
  - CORS `allow_origins` из конфигурации вместо wildcard
  - Предупреждение о дефолтном `SECRET_KEY` при старте
  - Health check (`/health`) с реальной проверкой БД
  - Ролевая защита адресов (`admin`/`dispatcher` для изменений)
- Исправлено:
  - Race condition в `RateLimiter` — потокобезопасность + ограничение размера словаря
  - `ErrorBoundary` редиректил на `/` вместо `/portal/`
  - `cn()` не мерджил конфликтующие Tailwind-классы → `tailwind-merge`
  - Двойная логика авторизации в `authStore` (fetch → apiClient)
  - Alembic: разорванная цепочка миграций (down_revision)
  - Зависимости зафиксированы (`requirements.txt`)

### Архитектура сервера (Phase 2)
- Рефакторинг:
  - **admin.py** разделён на 3 модуля: `admin.py` (282 строки), `admin_users.py`, `admin_backups.py`
  - VACUUM исправлен — использует raw sqlite3 (`isolation_level=None`) вместо SQLAlchemy-транзакции
  - `delete_all_tasks` теперь удаляет фото-файлы с диска
  - Удалены дубликаты эндпоинтов (`/db/restore/`, `/db/backup/`)
  - Inline Pydantic-модели из `tasks.py` вынесены в `app/schemas/task.py`

### Портал (Phase 2)
- Рефакторинг:
  - **Единый `dateFormat.ts`** — 7 функций форматирования + `getSla`, устранено ~120 строк дублирования из 9 страниц
  - **Modal.tsx** — `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, автовозврат фокуса
  - **User type** — `AuthUser` в authStore, `UserRole` импортируется из `types/user.ts` (убраны дубликаты)
  - **Card.tsx** — исправлен no-op тернарный оператор (`p-6 : p-6`)
  - `menuConfig.ts` — `UserRole` переиспользуется из `types/user.ts`

### Тесты
- Добавлено:
  - 24 теста для Dashboard API и Finance API (`test_dashboard_finance.py`)
  - Всего тестов: **282** (было 258)

## [2.4.6] - 2026-01-20

### REST API Standardization
- Изменено:
  - **PUT → PATCH** для всех частичных обновлений (15+ эндпоинтов):
    - `/api/tasks/{id}/status`, `/api/tasks/{id}/planned-date`, `/api/tasks/{id}/assign`
    - `/api/admin/users/{id}`, `/api/admin/tasks/{id}`, `/api/admin/custom-fields/{id}`, `/api/admin/permissions/{role}`
    - `/api/auth/profile`, `/api/auth/password`, `/api/auth/report-settings`
    - `/api/notifications/{id}/read`, `/api/notifications/read-all`
    - `/api/addresses/{id}`, `/api/addresses/{id}/systems/{sid}`, `/api/addresses/{id}/equipment/{eid}`, `/api/addresses/{id}/contacts/{cid}`
    - `/api/users/{id}`
    - `/api/admin/settings/{key}`, `/api/admin/settings` (bulk update)
  - **RESTful URL-паттерны для бэкапов**:
    - `GET /api/admin/backup/list` → `GET /api/admin/backups`
    - `POST /api/admin/backup/run` → `POST /api/admin/backups`
    - `GET/PUT /api/admin/backup/settings` → `GET/PATCH /api/admin/backups/settings`
    - `GET /api/admin/backup/download/{f}` → `GET /api/admin/backups/{f}/download`
    - `DELETE /api/admin/backup/{f}` → `DELETE /api/admin/backups/{f}`
    - `POST /api/admin/backup/restore/{f}` → `POST /api/admin/backups/{f}/restore`
  - **RESTful URL-паттерны для устройств**:
    - `POST /api/devices/register` → `POST /api/devices`
    - `GET /api/devices/all` → `GET /api/devices`
    - `GET /api/devices` (info) → `GET /api/devices/info`
  - **RESTful URL-паттерны для типов дефектов**:
    - `GET /api/admin/settings/defect-types/list` → `GET /api/admin/settings/defect-types`
    - `POST /api/admin/settings/defect-types/add` → `POST /api/admin/settings/defect-types`
  - `POST /api/admin/settings/bulk` → `PATCH /api/admin/settings`
- Обновлено:
  - Portal API клиент (6 файлов) — все вызовы приведены к новым эндпоинтам
  - Static JS (admin.js, workspace.js) — добавлен метод `patch()` в ApiClient
  - Тесты (5 файлов) — все 258 тестов проходят

## [2.4.5] - 2026-01-20
- Добавлено:
- Три темы оформления: modern, macOS-стиль и aurora night.
- Градиентные маркеры задач и темные тайлы карты для ночных тем.
- Быстрое добавление адреса из уведомления «адрес не найден» с автозаполнением формы.
- Глубокая ссылка из карточки адреса: переход к списку задач сразу с фильтром по адресу.
- Изменено:
- Карта: всплывающие карточки и фильтры «Новые/В работе» приведены к единому виду с явным состоянием и счетчиками (оба включены по умолчанию).
- Список задач: убраны быстрые фильтры, поиск переименован, активные фильтры показываются в чипах с быстрым сбросом; фильтр адреса прокинут в API.
- Значки статусов/приоритетов в темных темах смягчены под цветовую палитру.
- Поиск по задачам стал толерантнее к регистру/окончаниям (номер, заголовок, адрес, описание, клиент).

## [2.4.4] - 2026-01-19

### Портал
- Календарь: компактные квадратные ячейки и ограничение ширины контейнера.
- Карта: группировка заявок по адресу и счетчик на маркере.
- Список заявок: в колонке "Заявка" показывается неисправность.
- Настройки интерфейса: объединены параметры, переключатели изменения ширины колонок и компактного вида.
- Права доступа: страница управления и скрытие кнопок редактирования/удаления при запрете.
- Мобильный вид: правки перекрытий карты, выравнивание действий в "Мои заявки", ограничение ширины карточки.
- Устройства: список в системных настройках загружается через `/api/devices/all`.

### Сервер
- Добавлен `/api/auth/permissions` для прав текущего пользователя.
- Ужесточены права worker (без редактирования/удаления) + миграционный флаг.

## [2.4.3] - 2026-01-18

### Оптимизация Portal

#### Удаление дубликатов (~600 строк)
- ✖️ Удалён `api/addressExtended.ts` — дубликат `api/addresses.ts`
- ✖️ Удалён `hooks/useAddressExtended.ts` — дубликат `hooks/useAddresses.ts`
- ✖️ Удалён `types/api.ts` — неиспользуемые типы
- ✖️ Удалён `tokens.json` — пустой файл

#### Централизация констант
- ➕ Создан `utils/taskConstants.ts` — единые константы для статусов и приоритетов
- 🔄 `TasksPage` использует централизованные константы
- ✖️ Удалена неиспользуемая константа `PRIORITY_TO_NUMBER`

#### Исправление типов (12 `any` типов)
- 🛠️ `useAddresses.ts` — добавлены интерфейсы `PaginatedResponse`, `AxiosErrorResponse`
- 🛠️ `AdminSettingsPage.tsx` — типизация response.data
- 🛠️ `TasksPage.tsx` — типизация ошибок

#### Логирование в продакшн
- ➕ Создан `utils/logger.ts` — утилита `devError()`
- 🔄 12 вызовов `console.error` обёрнуты в `import.meta.env.DEV`

#### Code Splitting (React.lazy)
- ⚡ 17 страниц загружаются лениво через `React.lazy()`
- ⚡ Добавлен `Suspense` с `Spinner` в `App.tsx`

#### React.memo мемоизация
- ⚡ `Badge` — обёрнут в `memo()`
- ⚡ `StatusBadge` — обёрнут в `memo()`
- ⚡ `PriorityBadge` — обёрнут в `memo()`
- ⚡ `Card` — обёрнут в `memo()`
- ⚡ `Pagination` — обёрнут в `memo()`
- ⚡ `EmptyState` — обёрнут в `memo()`
- ⚡ `Spinner` — обёрнут в `memo()`

#### Прочее
- 🛠️ Добавлены экспорты в `components/index.ts`
- 🛠️ Сборка проверена: 40 бандлов, 0 ошибок

---

## [2.4.2] - 2026-01-15

### Добавлено
- **Server**: Новые поля в таблице `tasks`
  - `system_id` — ID системы обслуживания (FK на address_systems)
  - `system_type` — тип системы (video_surveillance, intercom, etc.)
  - `defect_type` — название типа неисправности
- **Server**: Поддержка system_id/system_type/defect_type в API
  - Добавлены поля в схемы `TaskCreate`, `TaskUpdate`, `TaskResponse`, `TaskListResponse`
  - Добавлены поля в `_base_task_dict()` для возврата через API
  - Обновлён `task_service.create()` для сохранения этих полей
  - Обновлён `admin_update_task` для обновления этих полей

### Исправлено
- **Portal**: Загрузка системы и типа неисправности при редактировании заявки
  - `SystemSelector` теперь автоматически устанавливает `selectedSystemType` при загрузке систем
  - `DefectTypeSelector` показывает сохранённый тип, даже если он не в отфильтрованном списке
  - Исправлена проблема с пустым типом неисправности в режиме редактирования
- **Server**: API не возвращало поля system_id/system_type/defect_type (отсутствовали в `_base_task_dict`)

### Изменено
- **Portal**: `DefectTypeSelector` — улучшено отображение
  - Показывает синий блок с текущим типом неисправности, если он не относится к выбранной системе
  - Позволяет выбрать другой тип из доступных для системы
- **Portal**: Фильтрация типов неисправностей по `system_types`
  - Типы неисправностей имеют массив `system_types` для привязки к системам
  - При выборе системы показываются только релевантные типы неисправностей

---

## [2.4.1] - 2026-01-14

### Добавлено
- **Portal**: Новая форма создания/редактирования заявок
  - ✨ Компонент `AddressForm` — пошаговый ввод адреса (город → улица → дом → корпус → подъезд)
  - ✨ Компонент `SystemSelector` — выбор системы обслуживания с фильтром по адресу
  - ✨ Компонент `DefectTypeSelector` — выбор типа неисправности с возможностью добавления
  - 🎯 Автоматическое название заявки: `{улица}, дом {номер}`
  - 📋 Новая структура формы: более логичный и пошаговый поток
- **Portal**: Новый хук `useSettings` для работы с системными настройками
  - `useDefectTypes()` — получить типы неисправностей
  - `useAddDefectType()` — добавить новый тип
  - `useDeleteDefectType()` — удалить тип
- **Server**: Новые API endpoints для типов неисправностей
  - `GET /api/admin/settings/defect-types/list` — получить все типы (доступно всем)
  - `POST /api/admin/settings/defect-types/add` — добавить новый тип (только админы)
  - `DELETE /api/admin/settings/defect-types/{id}` — удалить тип (только админы)
- **Server**: Инициализация типов неисправностей
  - Добавлена настройка `defect_types` в `init_default_settings()`
  - 5 стандартных типов: Замена фильтра, Замена счётчика, Ремонт, Обслуживание, Консультация

### Удалено
- **Portal**: Система шаблонов заявок
  - ❌ Удалены компоненты для создания/применения/удаления шаблонов из TaskFormPage
  - ❌ Удалены операции с localStorage (TEMPLATE_STORAGE_KEY)
  - ℹ️ localStorage не очищается, но шаблоны больше не используются

### Изменено
- **Portal**: TaskFormPage полностью переработана
  - 🔄 Новая структура данных с AddressFormData и addressId
  - 🔄 Новая валидация (отдельно для адреса и остальных полей)
  - 🔄 Пошаговый интерфейс вместо единой формы
- **Portal**: Интеграция с системами и адресами
  - `AddressForm` возвращает найденный адрес через `onAddressFound` callback
  - `SystemSelector` загружает системы для выбранного адреса

### Документация
- ✅ Создан `IMPLEMENTATION.md` — подробная архитектура
- ✅ Создан `IMPLEMENTATION_SUMMARY.md` — краткое резюме
- ✅ Создан `TESTING_GUIDE.md` — сценарии тестирования
- ✅ Создан `QUICKSTART.md` — быстрый старт

---

## [2.4.0] - 2026-01-14

### Добавлено
- **Portal**: Универсальная карточка объекта (адреса)
  - 7 вкладок: Информация, Системы, Оборудование, Документы, Контакты, Заявки, История
  - CRUD операции для всех сущностей через модальные формы
  - Просмотр истории изменений адреса
  - Связанные заявки по адресу
- **Portal**: Автоподставление адресов
  - Компонент `Autocomplete` для город/улица/дом
  - Компонент `AddressAutocomplete` для полного адреса в заявках
  - Подсказки из существующей базы адресов при вводе
- **Server**: API автоподставления адресов
  - `GET /api/addresses/autocomplete/cities` — уникальные города
  - `GET /api/addresses/autocomplete/streets` — улицы (фильтр по городу)
  - `GET /api/addresses/autocomplete/buildings` — дома (фильтр по городу+улице)
  - `GET /api/addresses/autocomplete/full` — поиск полных адресов
- **Server**: Расширенный API карточки адреса (`address_extended.py`)
  - CRUD для систем (`/api/addresses/{id}/systems`)
  - CRUD для оборудования (`/api/addresses/{id}/equipment`)
  - CRUD для документов (`/api/addresses/{id}/documents`)
  - CRUD для контактов (`/api/addresses/{id}/contacts`)
  - История изменений (`/api/addresses/{id}/history`)
  - Заявки по адресу (`/api/addresses/{id}/tasks`)

### Изменено
- **Portal**: Форма редактирования адреса перенесена из списка в карточку объекта
- **Portal**: Упрощена форма адреса (убраны чекбоксы лифт/домофон)
- **Server**: Добавлены недостающие колонки в БД (`extra_info`, `position`)

### Исправлено
- **Portal**: Синхронизация состояния форм при редактировании (useEffect для formData)
- **Portal**: Типы NodeJS.Timeout заменены на ReturnType<typeof setTimeout>

---

## [2.3.0] - 2026-01-13

### Добавлено
- **Server**: Расширенные инструменты для работы с БД
  - `GET /api/admin/db/stats` — детальная статистика (размер, кол-во записей по таблицам, статусы заявок)
  - `GET /api/admin/db/integrity` — проверка целостности SQLite (PRAGMA integrity_check)
  - `POST /api/admin/db/cleanup` — очистка старых заявок (с параметрами days, include_done, include_cancelled)
- **Portal**: Обновлённая карточка "База данных" в настройках
  - Статистика по таблицам в реальном времени
  - Кнопка проверки целостности БД
  - Модальное окно очистки старых данных с выбором периода

### Изменено
- **Server**: Миграция конфигурации на pydantic-settings
  - Автоматическая загрузка .env файлов
  - Валидация типов настроек при старте
  - Документирование всех параметров через Field()
  - Computed fields для вычисляемых путей
  - Удалена зависимость python-dotenv (встроено в pydantic-settings)
- **Server**: Обновлён .env.example с актуальными переменными
- **Server**: Исправлен спам логов при reload (добавлен reload_excludes)
- **Scripts**: Обновлены .cmd файлы запуска (активация venv, актуальные порты)

---

## [2.2.0] - 2026-01-13

### Добавлено
- **Portal**: Полноценная система резервного копирования
  - Создание бэкапов БД (gzip-сжатие SQLite)
  - Скачивание бэкапов через браузер
  - Удаление бэкапов с подтверждением
  - **Восстановление из бэкапа** с автоматическим pre-restore бэкапом
  - Настройки автобэкапа (расписание, retention)
  - Сохранение настроек бэкапа в БД
- **Server**: API для управления бэкапами
  - `GET /api/admin/backup/list` - список бэкапов
  - `POST /api/admin/backup/run` - создать бэкап
  - `GET /api/admin/backup/download/{filename}` - скачать бэкап
  - `DELETE /api/admin/backup/{filename}` - удалить бэкап
  - `POST /api/admin/backup/restore/{filename}` - восстановить из бэкапа
  - `GET/PUT /api/admin/backup/settings` - настройки бэкапов
- **Server**: Централизованная система версионирования
  - Версия хранится в `app/config.py` (API_VERSION)
  - Все endpoints используют единую версию
  - Версия отображается в `/health`, `/health/detailed`, `/api/info`

### Исправлено
- **Portal**: SPA routing — страницы больше не возвращают 404 при обновлении
  - Добавлен `basename="/portal"` в BrowserRouter
  - Добавлены fallback routes в main.py для SPA
- **Server**: Reports API — исправлена ошибка с приоритетами
  - Приоритеты теперь корректно конвертируются из int (1-4) в строки (PLANNED, CURRENT, URGENT, EMERGENCY)
- **Portal**: Исправлено скачивание и удаление бэкапов
  - Токен авторизации теперь берётся из правильного ключа localStorage
  - URL запросов изменены на относительные

---



### Добавлено
- **WhatsApp Bot**: Отправка отчётов о выполненных заявках
  - Webhook сервер на порту 3001 для получения уведомлений от сервера
  - Автоматическая отправка сообщения в группу при завершении заявки
  - Форматированный отчёт: номер, приоритет, адрес, исполнитель, сумма
  - POST /webhook/task-completed - отчёт о заявке
  - POST /webhook/send-message - произвольное сообщение
  - GET /health - статус бота
- **Система оплаты**: Расчёт оплаты за выполненные заявки
  - Чек-бокс "Удалённая заявка" (is_remote)
  - Чек-бокс "Платная заявка" (is_paid) с полем суммы
  - Автоматическая фиксация даты завершения (completed_at)
  - API эндпоинт `/api/admin/users/{id}/stats` для статистики пользователя
- **Admin Panel**: Раздел "Финансы"
  - Сводная статистика: выполнено, платных, удалённых, общая сумма
  - Таблица статистики по исполнителям
  - Фильтры по периоду (неделя, месяц, всё время)
  - Фильтр по конкретному исполнителю
  - Детальная статистика по клику на исполнителя
- **Admin Panel**: Финансовые поля в карточке заявки
  - Чек-боксы "Удалённая" и "Платная" 
  - Поле ввода суммы (показывается при отметке "Платная")
  - Иконки 🏠 и 💵 в таблице заявок для удалённых и платных
- **WhatsApp Bot**: Node.js бот для чтения сообщений из WhatsApp группы
  - Использует whatsapp-web.js (бесплатное решение)
  - Парсинг сообщений: номер заявки, приоритет, адрес, телефон, квартира
  - Автоматическое создание заявок на сервере
  - Конфигурация через .env файл
- **Server**: Умная система уведомлений
  - Уведомления НЕ отправляются при создании заявки
  - Уведомление "Вам назначена заявка" при назначении исполнителя
  - Уведомление "Изменён статус" при смене статуса (если не сам менял)
  - Уведомление "Новый комментарий" при добавлении комментария
- **Admin Panel**: Расширенные фильтры заявок
  - Фильтр по приоритету (Аварийная, Срочная, Текущая, Плановая)
  - Фильтр по дате "от" и "до"
  - Улучшенный поиск по адресу, заголовку, номеру
- **Admin Panel**: Комментарии в карточке заявки
  - Панель комментариев справа от формы заявки
  - Просмотр истории изменений
  - Добавление новых комментариев
  - Счётчик комментариев
- **Android**: Улучшенный BottomSheet на карте
  - Единый дизайн карточки заявки (как в списке)
  - Частичное раскрытие на 1/3 экрана
  - Свайп вверх для полного открытия
  - Кликабельный телефон для звонка

### Изменено
- **Server**: Работники видят только назначенные им заявки
- **Server**: Админы видят все заявки с параметром `all_tasks=true`
- **Admin Panel**: Запросы используют `all_tasks=true` для показа всех заявок
- **Android**: Улучшен дизайн TaskDetailBottomSheet

### Исправлено
- **Server**: Геокодирование с паттернами "д.", "д", "дом" для номеров домов
- **Server**: Добавлен город по умолчанию "Санкт-Петербург" для геокодирования

---

## [0.3.0] - 2024-11-30

### Добавлено
- **Android**: Splash Screen с использованием SplashScreen API
  - Кастомный логотип с иконкой локации
  - Фирменные цвета приложения
  - Плавный переход к основному экрану
- **Android**: Room Database для offline-режима
- **Android**: Compose Preview для визуального просмотра UI
  - `PreviewData.kt` - тестовые данные для preview
  - `ComponentPreviews.kt` - preview для TaskListItem, TaskListScreen, FiltersPanel, и т.д.
  - `MapScreenPreviews.kt` - preview для MapScreen компонентов
  - Поддержка светлой и тёмной темы
  - Preview для разных устройств (Phone, Tablet)
- **Android**: Pull-to-refresh для списка заявок
  - Индикатор обновления с текстом "Обновление..."
  - Автоматическое обновление при свайпе вниз
- **Android**: Кастомные звуки уведомлений
  - Отдельный канал для аварийных заявок (CHANNEL_ID_EMERGENCY)
  - Поддержка кастомных звуков (notification_task.mp3, notification_emergency.mp3)
  - Разные паттерны вибрации для обычных и аварийных заявок
  - Документация по добавлению звуков: docs/custom_sounds.md

### Изменено
- **Приоритеты заявок**: Переход на 4-уровневую систему
  - 1 = Плановая (зелёный)
  - 2 = Текущая (синий)
  - 3 = Срочная (оранжевый)
  - 4 = Аварийная (красный)
  - Приоритет автоматически извлекается из текста заявки
  - Обновлены Android модели, сервер, админ-панель
- **UI Карточка заявки**: Новый формат отображения
  - Заголовок: иконка приоритета + название приоритета + номер заявки
  - Номер заявки от диспетчера показывается без скобок (1138996 вместо [1138996])
  - Внутренний номер Z-00001 показывается в деталях заявки как "ID: Z-00001"
  - Добавлены методы `getDisplayNumber()`, `getInternalNumber()`, `getDispatcherNumber()` в Task.kt

### Исправлено
- **Server**: Улучшено геокодирование адресов Санкт-Петербурга
  - Добавлена поддержка "СПб", "С-Пб" сокращений
  - Добавлена поддержка "корп." сокращения для корпусов
  - Формат запроса изменён на "Название проспект 82к3" для лучшего распознавания
  - Извлечение номера заявки и приоритета из текста
  - Улучшена фильтрация служебного текста (подъезд, диспетчер, деньги и т.д.)
  - Кеширование задач и комментариев
  - Очередь отложенных действий (pending actions)
  - Автоматическая синхронизация при появлении сети
  - WorkManager для фоновой синхронизации
  - UI индикатор offline-режима
- **Android**: NetworkMonitor для отслеживания состояния сети
- **Android**: Network Security Config для HTTPS
- **Android**: Обработка сетевых ошибок
  - RetryInterceptor (до 3 попыток с экспоненциальной задержкой)
  - NetworkError sealed class с понятными сообщениями
  - Автоматический retry для таймаутов и 5xx ошибок
- **Server**: Поддержка PostgreSQL
  - Автоопределение типа БД из DATABASE_URL
  - Connection pooling для PostgreSQL
  - Скрипт миграции `migrate_to_postgres.py`
- **Server**: Поддержка HTTPS
  - Скрипт генерации SSL сертификатов
  - Документация по настройке Let's Encrypt
  - Пример конфигурации Nginx reverse proxy
- **Infrastructure**: Docker поддержка
  - Dockerfile для сервера
  - docker-compose.yml с PostgreSQL
  - .env.example для конфигурации
- **Docs**: HTTPS_SETUP.md с инструкциями по настройке SSL

### Изменено
- **Android**: MapViewModel теперь использует OfflineFirstTasksRepository
- **Android**: Данные загружаются сначала из кеша, затем обновляются с сервера
- **Android**: AndroidManifest использует networkSecurityConfig вместо usesCleartextTraffic
- **Android**: OkHttpClient использует RetryInterceptor
- **Server**: models.py теперь поддерживает SQLite и PostgreSQL

### Тесты
- **Unit тесты**: 32 теста для слоя данных
  - `OfflineFirstTasksRepositoryTest` - тесты offline-first стратегии
  - `RetryInterceptorTest` - тесты логики повторных попыток
  - `NetworkErrorTest` - тесты обработки ошибок
  - `TaskEntityTest` - тесты преобразования моделей

---

## [0.2.0] - 2024-11-30

### Добавлено
- **Android**: Кнопка настройки сервера на экране логина
- **Android**: Регистрация устройства после успешного логина (FCM push)
- **Android**: Поддержка нескольких устройств с разными именами
- **Admin Panel**: Автообновление списка заявок (10сек - 5мин)
- **Admin Panel**: Отображение имён пользователей вместо ID
- **Server**: Улучшенное геокодирование для адресов Ленинградской области
- **Server**: Детальное логирование регистрации устройств и push-уведомлений

### Исправлено
- **Android**: Работник теперь видит только назначенные ему заявки
- **Android**: Корректный выход из аккаунта с перезапуском Activity
- **Android**: FCM токен регистрируется для устройств с microG
- **Server**: Геокодирование адресов типа "Лен. обл. гп. Новоселье"
- **Build**: Настроен JDK 21 для совместимости с Gradle 8.14

### Изменено
- **Android**: FCMTokenDto теперь включает имя устройства
- **Android**: DeviceRepository выделен в отдельный класс

---

## [0.1.0] - 2024-11-XX

### Добавлено
- Первоначальная версия Android приложения
- Карта OpenStreetMap с отображением заявок
- Авторизация работников через JWT
- FastAPI сервер с REST API
- Админ-панель для управления заявками и пользователями
- Telegram бот для создания заявок
- Push-уведомления через Firebase Cloud Messaging
