# FieldWorker - AI Agent Guidelines

> **Версия:** 2.15.0 | **Обновлено:** 17 марта 2026

## Project Overview

FieldWorker — система управления полевыми заявками (field service management).

| Компонент | Технологии | Описание |
|-----------|------------|----------|
| **Android** (`app/`) | Kotlin, Jetpack Compose, Hilt, Room | Мобильное приложение для исполнителей |
| **Portal** (`portal/`) | React 18, TypeScript, Vite, TailwindCSS | Веб-портал для админов и диспетчеров |
| **Server** (`server/`) | FastAPI, SQLAlchemy, SQLite | REST API на порту **8001** |
| **Bot** (`bot/`) | Python, Telegram API | Опциональный Telegram бот |

---

## 📁 Project Structure

```
MyJobInMap/
├── app/                          # Android (Kotlin + Compose)
│   └── src/main/java/com/fieldworker/
│       ├── data/                 # API, DTO, Repository, Room DB
│       ├── domain/               # UseCase, Models
│       ├── di/                   # Hilt DI modules
│       └── ui/                   # Screens, ViewModels, Components
│
├── portal/                       # React Portal (TypeScript)
│   └── src/
│       ├── api/                  # Axios API client
│       ├── components/           # Reusable UI components
│       ├── pages/                # 18 pages (Dashboard, Tasks, Users, etc.)
│       ├── hooks/                # React Query hooks
│       ├── store/                # Zustand stores (auth, theme)
│       └── App.tsx               # Router with basename="/portal"
│
├── server/                       # FastAPI Backend
│   ├── main.py                   # Entry point, lifespan, routes
│   ├── app/
│   │   ├── config.py             # Settings (API_VERSION, paths, etc.)
│   │   ├── api/                  # API routers (15 files)
│   │   ├── models/               # SQLAlchemy ORM (9 files)
│   │   ├── schemas/              # Pydantic schemas (9 files)
│   │   ├── services/             # Business logic (11 files)
│   │   └── utils/                # Helpers
│   ├── backups/                  # Database backups (*.sqlite.gz)
│   ├── tests/                    # pytest tests
│   ├── templates/                # Jinja2 (admin.html, workspace.html)
│   └── static/                   # JS for old admin (admin.js, workspace.js)
│
├── docs/                         # Setup guides
└── *.md                          # Documentation files
```

---

## 🔌 API Endpoints (Port 8001)

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login → JWT token (**Rate limited: 5/60s per IP**) |
| GET | `/api/auth/me` | Current user info |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks (paginated: `items`, `total`, `page`) |
| GET | `/api/tasks/{id}` | Get task by ID |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/{id}` | Update task |
| PATCH | `/api/tasks/{id}/status` | Change status (validates transitions) |
| PATCH | `/api/tasks/{id}/planned-date` | Update planned date |
| PATCH | `/api/tasks/{id}/assign` | Assign task |
| DELETE | `/api/tasks/{id}` | Delete task |

### Comments & Photos
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks/{id}/comments` | Get comments |
| POST | `/api/tasks/{id}/comments` | Add comment |
| POST | `/api/tasks/{id}/photos` | Upload photo (multipart) |
| DELETE | `/api/photos/{id}` | Delete photo |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List users |
| PATCH | `/api/admin/users/{id}` | Update user |
| GET | `/api/admin/backups` | List backups |
| POST | `/api/admin/backups` | Create backup |
| GET | `/api/admin/backups/{filename}/download` | Download backup |
| POST | `/api/admin/backups/{filename}/restore` | **Restore from backup** |
| DELETE | `/api/admin/backups/{filename}` | Delete backup |
| GET/PATCH | `/api/admin/backups/settings` | Backup settings |

### Organizations (Multi-tenant)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations` | List organizations |
| POST | `/api/admin/organizations` | Create organization |
| GET | `/api/admin/organizations/{id}` | Get organization |
| PATCH | `/api/admin/organizations/{id}` | Update organization |
| DELETE | `/api/admin/organizations/{id}` | Deactivate (soft delete) |
| POST | `/api/admin/organizations/{id}/activate` | Reactivate organization |
| POST | `/api/admin/organizations/assign-user` | Assign user to org |
| POST | `/api/admin/organizations/{id}/unassign-user` | Remove user from org |
| GET | `/api/admin/organizations/{id}/users` | List org users |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/conversations` | List user's conversations (with unread_count) |
| POST | `/api/chat/conversations` | Create conversation (direct/group/task/org_general) |
| GET | `/api/chat/conversations/{id}` | Conversation detail (members, settings) |
| PATCH | `/api/chat/conversations/{id}` | Update conversation (rename group) |
| POST | `/api/chat/conversations/{id}/members` | Add members |
| DELETE | `/api/chat/conversations/{id}/members/{user_id}` | Remove member |
| PATCH | `/api/chat/conversations/{id}/mute` | Mute/unmute conversation |
| PATCH | `/api/chat/conversations/{id}/archive` | Archive/unarchive conversation |
| GET | `/api/chat/conversations/{id}/messages` | Messages (cursor pagination: before_id, limit) |
| POST | `/api/chat/conversations/{id}/messages` | Send message (text, reply_to_id) |
| PATCH | `/api/chat/messages/{id}` | Edit message (own, 24h window) |
| DELETE | `/api/chat/messages/{id}` | Soft-delete message |
| POST | `/api/chat/conversations/{id}/messages/search` | Search messages (ILIKE) |
| POST | `/api/chat/messages/{id}/attachments` | Upload attachment (10MB, image optimization) |
| POST | `/api/chat/messages/{id}/reactions` | Toggle reaction (emoji) |
| POST | `/api/chat/conversations/{id}/read` | Mark as read (read receipt) |
| GET | `/api/chat/task/{task_id}` | Get/create task conversation (shortcut) |

### Reports & Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports` | Analytics (periods: today, week, month, year, custom) |
| GET | `/api/reports/export` | Export CSV |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/finance/summary` | Finance summary |
| GET | `/api/devices` | List devices |
| POST | `/api/devices` | Register FCM token |
| GET | `/api/devices/info` | Device info |
| GET | `/api/updates/check` | Проверка наличия новой APK версии |
| GET | `/api/updates/download` | Скачать последнюю APK версию |
| GET | `/health` | Server health + version |
| GET | `/api/info` | Server info |

### Web UI
| URL | Description |
|-----|-------------|
| `/portal/` | React Portal (SPA with fallback) |
| `/admin/` | Old Bootstrap admin panel |
| `/workspace/` | Worker/dispatcher workspace |

---

## 🗃️ Server Architecture

### Models (`app/models/`)
| File | Models |
|------|--------|
| `user.py` | UserModel, DeviceModel |
| `task.py` | TaskModel, CommentModel, TaskPhotoModel |
| `address.py` | AddressModel, AddressSystemModel, AddressEquipmentModel, AddressDocumentModel, AddressContactModel, AddressHistoryModel + enums |
| `notification.py` | NotificationModel |
| `settings.py` | SystemSettingModel, CustomFieldModel, CustomFieldValueModel, RolePermissionModel + helper functions |
| `organization.py` | OrganizationModel (name, slug, limits, is_active) |
| `chat.py` | ConversationModel, ConversationMemberModel, MessageModel, MessageAttachmentModel, MessageReactionModel, MessageMentionModel + enums (ConversationType, ConversationMemberRole, MessageType) |
| `enums.py` | TaskStatus, TaskPriority, UserRole |

### Services (`app/services/`)
| File | Purpose |
|------|---------|
| `auth.py` | JWT, password hashing, get_current_user |
| `task_service.py` | Task CRUD, validation |
| `task_state_machine.py` | Status transitions (NEW→IN_PROGRESS→DONE) |
| `task_parser.py` | Extract priority, number from text |
| `geocoding.py` | Address → coordinates (cached) |
| `push.py` | Firebase Cloud Messaging |
| `rate_limiter.py` | Login rate limiting (5/60s) |
| `image_optimizer.py` | Photo compression (Pillow) |
| `address_parser.py` | Parse address components |
| `notification_service.py` | In-app notifications |
| `websocket_manager.py` | WebSocket ConnectionManager (броадкаст, per-user, ping/pong) |
| `sla_service.py` | SLA метрики (compliance, timing, by_priority, trends) |
| `excel_export.py` | Экспорт заявок в Excel (openpyxl, 2 листа) |
| `tenant_service.py` | CRUD для организаций (create, update, deactivate, assign_user) |
| `tenant_filter.py` | Multi-tenant изоляция данных (apply/check_access/enforce_access) |
| `chat_service.py` | Чат: CRUD разговоров, сообщения, реакции, read receipts, @mentions, поиск |

### API Routers (`app/api/`)
| File | Prefix | Purpose |
|------|--------|---------|
| `auth.py` | `/api/auth` | Login, me |
| `tasks.py` | `/api/tasks` | Tasks CRUD + comments |
| `photos.py` | `/api/photos` | Photo upload/download |
| `admin.py` | `/api/admin` | Tasks, Devices, Custom Fields, Permissions |
| `admin_users.py` | `/api/admin` | User CRUD, worker list, user stats |
| `admin_backups.py` | `/api/admin` | Backups, DB management (seed, vacuum, optimize) |
| `reports.py` | `/api/reports` | Analytics |
| `dashboard.py` | `/api/dashboard` | Dashboard stats |
| `finance.py` | `/api/finance` | Finance summary |
| `devices.py` | `/api/devices` | FCM tokens |
| `notifications.py` | `/api/notifications` | Push notifications |
| `addresses.py` | `/api/addresses` | Address CRUD + autocomplete |
| `address_extended.py` | `/api/addresses/{id}/...` | Systems, equipment, documents, contacts, history |
| `users.py` | `/api/users` | User management |
| `system_settings.py` | `/api/system-settings` | System settings |
| `sla.py` | `/api/sla` | SLA метрики (overview, timing, by_priority, trends) |
| `websocket.py` | `/ws` | WebSocket endpoint с JWT auth |
| `updates.py` | `/api/updates` | Android APK updates (check, upload, download, history, delete) |
| `chat.py` | `/api/chat` | Chat: conversations, messages, reactions, read receipts, attachments |

---

## 🎨 Portal Architecture

### Pages (`portal/src/pages/`)
| Page | Route | Description |
|------|-------|-------------|
| `DashboardPage` | `/` | Statistics dashboard |
| `TasksPage` | `/tasks` | Task list with filters |
| `TaskDetailPage` | `/tasks/:id` | Task details |
| `TaskFormPage` | `/tasks/new`, `/tasks/:id/edit` | Create/edit task |
| `UsersPage` | `/users` | User management |
| `MapPage` | `/map` | Tasks on map |
| `CalendarPage` | `/calendar` | Calendar view |
| `ReportsPage` | `/reports` | Analytics reports |
| `FinancePage` | `/finance` | Finance dashboard |
| `AddressesPage` | `/addresses` | Address database |
| `AddressDetailPage` | `/addresses/:id` | **Address card (7 tabs)** |
| `NotificationsPage` | `/notifications` | Notifications |
| `DevicesPage` | `/devices` | FCM devices |
| `AdminSettingsPage` | `/settings` | Admin settings + **Backups** |
| `ProfilePage` | `/profile` | User profile |
| `SlaPage` | `/sla` | **SLA дашборд** (KPI, приоритеты, исполнители, тренды) |
| `OrganizationsPage` | `/admin/organizations` | **Организации** (таблица, создание/редактирование/деактивация) |
| `OrganizationDetailPage` | `/admin/organizations/:id` | **Карточка организации** (информация, пользователи) |
| `UpdatesPage` | `/admin/updates` | **Android updates** (совместимый redirect в секцию обновлений админки) |

### Key Components
- `DashboardLayout` — Main layout with sidebar
- `Card`, `Button`, `Input` — UI primitives
- `Modal` — Accessible dialog (focus trap, ARIA)
- `TaskCard`, `TaskFilters` — Task-specific
- `Spinner`, `EmptyState` — Loading states

### Shared Utilities (`portal/src/utils/`)
- `dateFormat.ts` — 7 formatting functions + `getSla` (single source of truth)
- `cn.ts` — `clsx` + `tailwind-merge` for className merging

### State Management
- **Zustand**: `useAuthStore` (token, `AuthUser`, login/logout)
- **React Query**: API data fetching and caching
- **Types**: `UserRole` defined in `types/user.ts`, re-exported from `menuConfig.ts`

---

## ⚠️ Critical Notes

### Server
- ✅ **Port 8001** (not 8000)
- ✅ **Version** stored in `app/config.py` → `API_VERSION = "2.15.0"`
- ✅ **REST standard**: PATCH for partial updates, PUT for full replacements
- ✅ **Rate Limiting** on `/api/auth/login` (5 attempts / 60 seconds per IP)
- ✅ **Task Status Transitions** validated:
  ```
  NEW → IN_PROGRESS, CANCELLED
  IN_PROGRESS → DONE, CANCELLED
  DONE → терминальный статус
  CANCELLED → терминальный статус
  ```
- ✅ **Pagination**: `/api/tasks` returns `{ items: [], total, page, size }`
- ✅ **Backups** stored in `server/backups/` as `*.sqlite.gz`

### Portal
- ✅ **BrowserRouter** with `basename="/portal"`
- ✅ **SPA Fallback** in `main.py` for `/portal/*` routes
- ✅ **Auth token** in `localStorage['fieldworker-auth']` as JSON
- ✅ **API client** uses relative URLs (`/api/...`)

### Android
- ✅ **Emulator** connects via `10.0.2.2:8001`
- ✅ **Photo URLs** must use `getFullServerUrl()` (includes port)
- ✅ **network_security_config**: `cleartextTrafficPermitted="true"` for dev
- ✅ **APK updates**: `versionName` и `versionCode` извлекаются сервером напрямую из `AndroidManifest.xml` внутри APK
- ✅ **App version**: `app/build.gradle.kts` → `versionCode = 21500`, `versionName = "2.15.0"`

---

## 🛠️ Development Commands

### Server
```bash
cd server
make run-server          # Start on http://localhost:8001
make test                # Run all tests (490+)
make seed                # Seed DB (admin/admin)
make format              # Black + isort
make clean               # Clear __pycache__
```

### Portal
```bash
cd portal
npm install
npm run dev              # Start on http://localhost:5173
npm run build            # Build to dist/
```

### Android
```bash
./gradlew assembleDebug  # Build APK
./gradlew installDebug   # Install on device
```

---

## 📊 Data Models

### TaskStatus (enum)
| Value | Display | Color |
|-------|---------|-------|
| `NEW` | Новая | Red |
| `IN_PROGRESS` | В работе | Orange |
| `DONE` | Выполнена | Green |
| `CANCELLED` | Отменена | Gray |

### TaskPriority (enum)
| Value | Display | Color | Int |
|-------|---------|-------|-----|
| `PLANNED` | Плановая | Green | 1 |
| `CURRENT` | Текущая | Blue | 2 |
| `URGENT` | Срочная | Orange | 3 |
| `EMERGENCY` | Аварийная | Red | 4 |

### UserRole (enum)
| Value | Permissions |
|-------|-------------|
| `admin` | Full access |
| `dispatcher` | Create/edit tasks, view reports |
| `worker` | View assigned tasks, change status |

---

## 🔒 Security

### Rate Limiting
- **Endpoint**: `/api/auth/login`
- **Limit**: 5 failed attempts per IP
- **Window**: 60 seconds
- **Response**: `429 Too Many Requests` with `Retry-After` header

### JWT Authentication
- **Algorithm**: HS256
- **Expiry**: 7 days
- **Header**: `Authorization: Bearer <token>`

### Backup Security
- Path traversal protection (no `..`, `/`, `\` in filenames)
- Admin-only access
- Auto pre-restore backup before restore

---

## 📝 File Locations

### Version
- `server/app/config.py` → `API_VERSION = "2.15.0"`
- `app/build.gradle.kts` → `versionCode = 21500`, `versionName = "2.15.0"`

### Changelog
- `CHANGELOG.md` — Full version history

### Documentation
| File | Purpose |
|------|---------|
| `README.md` | Main project guide |
| `AGENTS.md` | This file (AI guidelines) |
| `CHANGELOG.md` | Version history |
| `GETTING_STARTED.md` | Quick start (5 min) |
| `docs/FIREBASE_SETUP.md` | Push notifications |
| `docs/HTTPS_SETUP.md` | SSL certificates |
| `docs/DEPLOYMENT.md` | Production deployment |
| `.github/copilot-instructions.md` | Copilot context |

---

## 🐛 Known Issues / Tech Debt

- [x] ~~Pydantic v1 deprecation warnings~~ → Миграция на `ConfigDict` завершена
- [x] ~~`datetime.utcnow()` deprecated~~ → Заменено на `datetime.now(timezone.utc)`
- [x] ~~Portal: дублирование кода~~ → Удалено ~600 строк + ещё ~120 строк (dateFormat.ts)
- [x] ~~Portal: `any` типы~~ → Исправлено 12 типов
- [x] ~~Тесты `test_task_state_machine` требуют обновления~~ → state machine разрешает DONE/CANCELLED → обратно
- [x] ~~admin.py монолит (1300+ строк)~~ → Разделён на admin.py + admin_users.py + admin_backups.py
- [x] ~~VACUUM внутри SQLAlchemy-транзакции~~ → raw sqlite3 с isolation_level=None
- [x] ~~Portal: дублирование User/UserRole типов~~ → AuthUser + единый UserRole
- [x] ~~Modal без ARIA / focus trap~~ → Полный a11y: role, aria-modal, focus trap
- [Строка удалена] ~~Portal: предсуществующие TS ошибки~~ → SystemSelector.model, AdminSettings.SettingValue, TaskDetail.amount исправлены
- [x] ~~Portal: `any` обработка ошибок API~~ → `apiError.ts` — единый error handler
- [x] ~~Portal: Spinner вместо Skeleton~~ → `Skeleton.tsx` компоненты (Dashboard/Tasks/Users)
- [x] ~~Portal: noUncheckedIndexedAccess~~ → Включено, ~60 ошибок исправлено
- [x] ~~Тестовое покрытие сервера~~ → 490+ тестов
- [x] ~~Portal unit тесты~~ → 44 теста (Vitest: dateFormat, cn, apiError, getSla)
- [x] ~~`set_setting()` не поддерживал upsert~~ → Исправлено: upsert + description/group/label
- [x] ~~Android unit тесты~~ → 85 тестов (LoginViewModel, MapViewModel, OfflineFirstTasksRepository)
- [x] ~~Navigation Compose~~ → `Screen.kt` + `NavHost` в `MainScreen.kt`
- [x] ~~Paging 3~~ → `room-paging` + `PagingSource` + `LazyPagingItems` в TaskListScreen
- [x] ~~Token refresh~~ → `/api/auth/refresh` + `TokenAuthenticator` + 8 тестов

---

## 🔧 Common Tasks

### Add new API endpoint
1. Create/update router in `server/app/api/`
2. Add Pydantic schema in `server/app/schemas/`
3. Register router in `server/app/api/__init__.py`
4. Add tests in `server/tests/`

### Add new Portal page
1. Create page in `portal/src/pages/`
2. Add route in `portal/src/App.tsx`
3. Add to menu in `portal/src/config/menuConfig.ts`
4. Create React Query hook if needed

### Update version
1. Edit `server/app/config.py` → `API_VERSION`
2. Edit `app/build.gradle.kts` → `versionCode`, `versionName`
3. Add entry to `CHANGELOG.md`
4. Update `README.md` version mentions

---

**Maintained by:** FieldWorker Team  
**Last updated:** 12 марта 2026
