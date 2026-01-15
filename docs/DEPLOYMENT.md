# 🚀 Развертывание на удалённый сервер Ubuntu Linux

**Дата:** 9 декабря 2025  
**Версия:** 2.0.0  
**Статус:** ✅ Production Ready

---

## 📋 Содержание

1. [Подготовка сервера](#подготовка-сервера)
2. [Вариант 1: Git + автоматический деплой](#вариант-1-git--автоматический-деплой)
3. [Вариант 2: Docker + rsync](#вариант-2-docker--rsync)
4. [Вариант 3: CI/CD (GitHub Actions)](#вариант-3-cicd-github-actions)
5. [Мониторинг и логи](#мониторинг-и-логи)

---

## Подготовка сервера

### Шаг 1: Базовая настройка (выполнить на сервере)

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker и Docker Compose
sudo apt install -y docker.io docker-compose git curl wget

# Добавление пользователя в группу docker (без sudo)
sudo usermod -aG docker $USER
newgrp docker

# Проверка установки
docker --version
docker-compose --version
```

### Шаг 2: Подготовка директорий

```bash
# Создание директорий проекта
mkdir -p /opt/fieldworker
cd /opt/fieldworker

# Установка прав
sudo chown -R $USER:$USER /opt/fieldworker
chmod 755 /opt/fieldworker
```

### Шаг 3: SSH ключ для git (опционально)

```bash
# На сервере: создание SSH ключа для GitHub
ssh-keygen -t ed25519 -C "your-email@example.com" -f ~/.ssh/github_key -N ""

# Показать публичный ключ (добавить на GitHub)
cat ~/.ssh/github_key.pub

# Конфигурация git
git config --global user.email "your-email@example.com"
git config --global user.name "Your Name"
```

---

## Вариант 1: Git + автоматический деплой

### Оптимально для: Небольших проектов, частых обновлений

#### Шаг 1: Первоначальный clone

```bash
cd /opt/fieldworker
git clone https://github.com/YOUR_USERNAME/MyJobInMap.git .
# или с SSH:
# git clone git@github.com:YOUR_USERNAME/MyJobInMap.git .
```

#### Шаг 2: Создать скрипт автоматического обновления

Создать файл `/opt/fieldworker/deploy.sh`:

```bash
#!/bin/bash
set -e

# Логирование
LOG_FILE="/var/log/fieldworker-deploy.log"
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Начало деплоя" >> $LOG_FILE

# Перейти в директорию проекта
cd /opt/fieldworker

# Остановить контейнеры
echo "Остановка контейнеров..." >> $LOG_FILE
docker-compose down >> $LOG_FILE 2>&1 || true

# Обновить код из git
echo "Обновление кода..." >> $LOG_FILE
git fetch origin >> $LOG_FILE 2>&1
git reset --hard origin/main >> $LOG_FILE 2>&1

# Скопировать .env если не существует
if [ ! -f .env ]; then
    echo "Создание .env из .env.example..." >> $LOG_FILE
    cp .env.example .env
    echo "⚠️  Отредактируйте .env и добавьте необходимые переменные!" >> $LOG_FILE
fi

# Собрать и запустить контейнеры
echo "Сборка и запуск контейнеров..." >> $LOG_FILE
docker-compose up -d --build >> $LOG_FILE 2>&1

# Проверка статуса
echo "Проверка статуса..." >> $LOG_FILE
docker-compose ps >> $LOG_FILE

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Деплой завершён успешно" >> $LOG_FILE
echo "✅ Проект готов к использованию!"
```

#### Шаг 3: Дать права и протестировать

```bash
chmod +x /opt/fieldworker/deploy.sh

# Первый запуск
/opt/fieldworker/deploy.sh
```

#### Шаг 4: Автоматизация (Cron)

```bash
# Открыть crontab редактор
crontab -e

# Добавить строку для автоматического обновления каждые 5 минут
*/5 * * * * /opt/fieldworker/deploy.sh >> /var/log/fieldworker-cron.log 2>&1

# Или каждый час в 00 минут
0 * * * * /opt/fieldworker/deploy.sh >> /var/log/fieldworker-cron.log 2>&1
```

#### Шаг 5: Создать webhook для мгновенного деплоя (опционально)

Создать файл `/opt/fieldworker/webhook.py`:

```python
#!/usr/bin/env python3
"""
GitHub Webhook сервер для автоматического деплоя
Запуск: python3 webhook.py
Порт: 9000
"""

from flask import Flask, request
import subprocess
import hmac
import hashlib
import os

app = Flask(__name__)
GITHUB_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "your-secret-key")

@app.route('/webhook', methods=['POST'])
def webhook():
    # Верификация подписи GitHub
    signature = request.headers.get('X-Hub-Signature-256', '')
    payload = request.get_data()
    
    expected = 'sha256=' + hmac.new(
        GITHUB_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(signature, expected):
        return {'error': 'Invalid signature'}, 403
    
    # Событие push на main
    if request.json.get('ref') == 'refs/heads/main':
        print("🚀 Push detected, starting deploy...")
        subprocess.run(['/opt/fieldworker/deploy.sh'], check=True)
        return {'status': 'Deploy started'}, 200
    
    return {'status': 'OK'}, 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9000)
```

Установить Flask и запустить:

```bash
pip install flask

# Создать systemd сервис для webhook
sudo tee /etc/systemd/system/fieldworker-webhook.service > /dev/null <<EOF
[Unit]
Description=FieldWorker GitHub Webhook
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/fieldworker
Environment="GITHUB_WEBHOOK_SECRET=your-secret-key"
ExecStart=/usr/bin/python3 /opt/fieldworker/webhook.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable fieldworker-webhook
sudo systemctl start fieldworker-webhook
```

На GitHub добавить webhook:
- Repository → Settings → Webhooks → Add webhook
- Payload URL: `http://your-server-ip:9000/webhook`
- Content type: `application/json`
- Secret: `your-secret-key`
- Events: `Push events`

---

## Вариант 2: Docker + rsync

### Оптимально для: Полный контроль, быстрое обновление файлов

#### На локальном компьютере (Windows PowerShell):

Создать файл `deploy-rsync.ps1`:

```powershell
# deploy-rsync.ps1
# Использование: .\deploy-rsync.ps1

$SERVER = "username@your-server-ip"
$REMOTE_PATH = "/opt/fieldworker"
$LOCAL_PATH = "C:\Users\VADIM\Documents\MyJobInMap"

Write-Host "🚀 Начало синхронизации с сервером..." -ForegroundColor Green

# rsync: синхронизация всех файлов (кроме исключений)
rsync.exe -avz `
  --exclude=".git" `
  --exclude=".env" `
  --exclude="venv" `
  --exclude="node_modules" `
  --exclude="__pycache__" `
  --exclude=".pytest_cache" `
  --exclude="*.pyc" `
  --exclude=".idea" `
  --exclude=".gradle" `
  --exclude="build" `
  --exclude="tasks.db" `
  --exclude=".wwebjs_auth" `
  --exclude=".wwebjs_cache" `
  "$LOCAL_PATH\" "$SERVER:$REMOTE_PATH"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Синхронизация завершена!" -ForegroundColor Green
    
    # Перестартовать контейнеры
    Write-Host "🔄 Перезагрузка контейнеров..." -ForegroundColor Yellow
    ssh $SERVER "cd $REMOTE_PATH && docker-compose up -d --build"
    
    Write-Host "✅ Деплой завершён!" -ForegroundColor Green
} else {
    Write-Host "❌ Ошибка синхронизации!" -ForegroundColor Red
}
```

Запустить:

```powershell
.\deploy-rsync.ps1
```

---

## Вариант 3: CI/CD (GitHub Actions)

### Оптимально для: Автоматические тесты + деплой, Production

#### Создать файл `.github/workflows/deploy.yml`:

```yaml
name: 🚀 Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Run tests
        run: |
          cd server
          pip install -r requirements.txt
          make test
      
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd /opt/fieldworker
            git fetch origin
            git reset --hard origin/main
            docker-compose up -d --build
            docker-compose ps
```

Добавить в GitHub Secrets:
- `SERVER_HOST` - IP адрес сервера
- `SERVER_USER` - пользователь SSH
- `SERVER_SSH_KEY` - содержимое приватного ключа

---

## Мониторинг и логи

### Просмотр логов

```bash
# Все логи
docker-compose logs -f

# Только API
docker-compose logs -f api

# За последние 100 строк
docker-compose logs -f --tail=100 api

# Сохранить в файл
docker-compose logs api > logs.txt
```

### Проверка статуса

```bash
# Статус контейнеров
docker-compose ps

# Использование ресурсов
docker stats

# Логи systemd (если запущено как сервис)
sudo journalctl -u fieldworker-webhook -f
```

### Systemd сервис для Docker Compose

Создать `/etc/systemd/system/fieldworker-docker.service`:

```ini
[Unit]
Description=FieldWorker Docker Compose
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/fieldworker
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Активировать:

```bash
sudo systemctl daemon-reload
sudo systemctl enable fieldworker-docker
sudo systemctl start fieldworker-docker
```

---

## 📊 Рекомендуемая схема (Production)

```
┌─────────────────────────────────┐
│   Local Development (Windows)   │
│  .\deploy-rsync.ps1 или git    │
└────────────┬────────────────────┘
             │ SSH/rsync/git
             ▼
┌─────────────────────────────────┐
│    Ubuntu Server (Linux)        │
│  /opt/fieldworker               │
│  ├── Docker Compose             │
│  ├── Systemd service            │
│  └── GitHub Webhook (опцион.)   │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│    4 Docker контейнера:         │
│  • API (FastAPI) :8001          │
│  • WhatsApp Bot :3001           │
│  • Telegram Bot                 │
│  • Webapp (Nginx) :8080         │
└─────────────────────────────────┘
```

---

## ✅ Быстрый старт (10 минут)

### На Ubuntu сервере:

```bash
# 1. SSH на сервер
ssh ubuntu@your-server-ip

# 2. Подготовка
sudo apt update && sudo apt install -y docker.io docker-compose git
sudo usermod -aG docker $USER
newgrp docker

# 3. Clone проекта
mkdir -p /opt/fieldworker && cd /opt/fieldworker
git clone https://github.com/YOUR_USERNAME/MyJobInMap.git .

# 4. Конфигурация
cp .env.example .env
# ✏️ Отредактируйте .env и добавьте переменные

# 5. Запуск
docker-compose up -d --build

# 6. Проверка
docker-compose ps
```

### На локальном компьютере (для обновлений):

```bash
# Вариант 1: Git push
git add .
git commit -m "Update deployment"
git push origin main
# Сервер автоматически обновится через webhook или cron

# Вариант 2: rsync
.\deploy-rsync.ps1

# Вариант 3: Вручную через SSH
ssh ubuntu@your-server-ip "cd /opt/fieldworker && git pull && docker-compose up -d --build"
```

---

## 🔒 Безопасность

### Firewall (UFW)

```bash
sudo ufw enable
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 8001/tcp  # API
sudo ufw allow 8080/tcp  # Webapp
sudo ufw allow 3001/tcp  # WhatsApp Bot (только внутренняя сеть)
```

### SSL/TLS сертификат (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx

# Получить сертификат
sudo certbot certonly --standalone -d your-domain.com

# Сертификаты в: /etc/letsencrypt/live/your-domain.com/
```

### Reverse Proxy (Nginx для SSL)

Создать `/etc/nginx/sites-available/fieldworker`:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

Активировать:

```bash
sudo ln -s /etc/nginx/sites-available/fieldworker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 📞 Поддержка

Документация:
- Docker: https://docs.docker.com
- Docker Compose: https://docs.docker.com/compose
- GitHub Actions: https://docs.github.com/en/actions
- Let's Encrypt: https://letsencrypt.org

---

**Версия:** 2.0.0  
**Обновлено:** 9 декабря 2025  
**Статус:** ✅ Production Ready
