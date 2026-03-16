# 🚀 FieldWorker - Быстрый старт (5 минут)

> **Версия:** 2.14.2 | **Статус:** ✅ Production Ready

## 1. Установка сервера

```bash
cd server
pip install -r requirements.txt
```

## 2. Seed тестовых данных

```bash
make seed
```

Создаёт:
- 👤 **admin/admin** — администратор
- 👤 **dispatcher/dispatcher** — диспетчер  
- 👤 **worker/worker** — работник
- 📋 10 тестовых заявок

## 3. Запуск сервера

```bash
make run-server
```

Сервер доступен на **http://localhost:8001**

| URL | Описание |
|-----|----------|
| `/docs` | Swagger API документация |
| `/portal/` | React веб-портал |
| `/admin/` | Старая Bootstrap админка |
| `/health` | Статус сервера |

## 4. Запуск тестов

```bash
make test
```

**Ожидаемый результат:** 490+ тестов ✅

## 5. Запуск портала (опционально)

```bash
cd portal
npm install
npm run dev
```

Портал на **http://localhost:5173**

Или откройте **http://localhost:8001/portal/** (встроенный)

---

## 📱 Android

1. Откройте проект в **Android Studio**
2. Запустите эмулятор
3. В настройках укажите сервер: `10.0.2.2:8001`
4. Войдите как `worker/worker`

---

## ⚙️ Основные команды

```bash
cd server

make run-server     # Запуск сервера на :8001
make test           # Все тесты (490+)
make seed           # Создать тестовые данные
make format         # Форматирование (black + isort)
make clean          # Очистка кэша
make help           # Все команды
```

---

## 🔑 Тестовые аккаунты

| Логин | Пароль | Роль |
|-------|--------|------|
| admin | admin | Администратор |
| dispatcher | dispatcher | Диспетчер |
| worker | worker | Работник |

---

## 📋 Что включено в v2.14.2

- ✅ **Организации и multi-tenant** — фильтрация данных и org-admin сценарии
- ✅ **React Portal** — 18+ страниц, системные настройки и админка обновлений APK
- ✅ **Rate Limiting** — защита от brute-force (5/60s)
- ✅ **State Machine** — валидация переходов статусов
- ✅ **Статусы без переоткрытия** — `DONE` и `CANCELLED` стали терминальными во всех клиентах
- ✅ **Обязательный комментарий** — завершение и отмена заявки требуют комментарий в portal, workspace и Android
- ✅ **490+ тестов** — pytest, расширенное покрытие API и сервисов
- ✅ **Push-уведомления** — Firebase Cloud Messaging
- ✅ **Offline-режим** — Room DB в Android приложении
- ✅ **Android-обновления** — загрузка APK, извлечение версии из APK и проверка обновлений в приложении

---

## 📚 Следующие шаги

| Документ | Описание |
|----------|----------|
| [README.md](README.md) | Полная документация |
| [CHANGELOG.md](CHANGELOG.md) | История версий |
| [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) | Push-уведомления |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production развертывание |

---

**Последнее обновление:** 16 марта 2026
