# Настройка Firebase Push Notifications

## 1. Создание проекта Firebase

1. Перейдите в [Firebase Console](https://console.firebase.google.com/)
2. Нажмите **"Добавить проект"**
3. Введите название (например, "FieldWorker")
4. Отключите Google Analytics (опционально) и нажмите **"Создать проект"**

## 2. Добавление Android приложения

1. В Firebase Console нажмите **"Добавить приложение"** → **Android**
2. Введите Package name: `com.fieldworker`
3. Nickname: `FieldWorker Android`
4. SHA-1: (опционально, для аутентификации)
5. Нажмите **"Зарегистрировать приложение"**
6. **Скачайте `google-services.json`**
7. Скопируйте файл в: `app/google-services.json` (замените placeholder)

## 3. Настройка сервера (Service Account)

1. В Firebase Console → **Project Settings** (⚙️) → **Service accounts**
2. Нажмите **"Generate new private key"**
3. Скачайте JSON файл
4. Переименуйте в `firebase-service-account.json`
5. Скопируйте в папку `server/`

```
server/
├── main.py
├── firebase-service-account.json  ← сюда
├── requirements.txt
└── venv/
```

## 4. Структура файлов

### Android (`app/google-services.json`)
```json
{
  "project_info": {
    "project_number": "123456789",
    "project_id": "fieldworker-xxxxx",
    ...
  },
  "client": [...]
}
```

### Сервер (`server/firebase-service-account.json`)
```json
{
  "type": "service_account",
  "project_id": "fieldworker-xxxxx",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "firebase-adminsdk-xxxxx@fieldworker-xxxxx.iam.gserviceaccount.com",
  ...
}
```

## 5. Тестирование

### Проверка статуса Firebase на сервере:
```bash
curl http://localhost:8001/api/devices
```

Ответ с Firebase:
```json
{
  "count": 0,
  "tokens": [],
  "firebase_enabled": true
}
```

### Отправка тестового уведомления:
```bash
curl -X POST http://localhost:8001/api/notifications/test
```

### Отправка кастомного уведомления:
```bash
curl -X POST http://localhost:8001/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Новая задача",
    "body": "Вам назначена задача #12345",
    "notification_type": "new_task",
    "task_id": 12345,
    "task_number": "Z-00001"
  }'
```

## 6. Типы уведомлений

| Type | Описание |
|------|----------|
| `new_task` | Новая назначенная задача |
| `status_change` | Изменение статуса задачи |
| `general` | Общее уведомление |

## 7. Переменные окружения

Можно указать путь к credentials через переменную:

```bash
# Windows PowerShell
$env:FIREBASE_CREDENTIALS = "C:\path\to\firebase-service-account.json"

# Linux/Mac
export FIREBASE_CREDENTIALS="/path/to/firebase-service-account.json"
```

## 8. Безопасность

⚠️ **ВАЖНО**: Никогда не коммитьте в git:
- `google-services.json`
- `firebase-service-account.json`

Добавьте в `.gitignore`:
```
google-services.json
firebase-service-account.json
```
