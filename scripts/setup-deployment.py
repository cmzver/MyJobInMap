#!/usr/bin/env python3
"""
🚀 Интерактивный скрипт развертывания FieldWorker на Ubuntu сервер
Использование: python3 setup-deployment.py
"""

import os
import subprocess
import sys
from pathlib import Path

def print_banner(title):
    """Печать красивого заголовка"""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70 + "\n")

def run_command(cmd, shell=False, check=True):
    """Выполнить команду и вернуть результат"""
    try:
        result = subprocess.run(
            cmd,
            shell=shell,
            check=check,
            capture_output=True,
            text=True
        )
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, "", str(e)

def create_deploy_script():
    """Создать bash скрипт для сервера"""
    script_content = '''#!/bin/bash
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
'''
    return script_content

def create_webhook_script():
    """Создать Python скрипт webhook для GitHub"""
    script_content = '''#!/usr/bin/env python3
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
'''
    return script_content

def create_systemd_service(webhook_secret):
    """Создать systemd сервис для webhook"""
    service_content = f'''[Unit]
Description=FieldWorker GitHub Webhook
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/fieldworker
Environment="GITHUB_WEBHOOK_SECRET={webhook_secret}"
ExecStart=/usr/bin/python3 /opt/fieldworker/webhook.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
'''
    return service_content

def create_rsync_script(server_ip, server_user):
    """Создать PowerShell скрипт для rsync"""
    script_content = f'''# deploy-rsync.ps1
# Windows PowerShell script для синхронизации с сервером
# Использование: .\\deploy-rsync.ps1

$SERVER = "{server_user}@{server_ip}"
$REMOTE_PATH = "/opt/fieldworker"
$LOCAL_PATH = $PSScriptRoot

Write-Host "🚀 Начало синхронизации с сервером..." -ForegroundColor Green

# Проверка rsync
if (-not (Get-Command rsync -ErrorAction SilentlyContinue)) {{
    Write-Host "⚠️  rsync не установлен. Установите Git for Windows с опцией rsync." -ForegroundColor Yellow
    exit 1
}}

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
  "$LOCAL_PATH\\" "$SERVER:$REMOTE_PATH"

if ($LASTEXITCODE -eq 0) {{
    Write-Host "✅ Синхронизация завершена!" -ForegroundColor Green
    
    # Перестартовать контейнеры
    Write-Host "🔄 Перезагрузка контейнеров..." -ForegroundColor Yellow
    ssh $SERVER "cd $REMOTE_PATH && docker-compose up -d --build"
    
    Write-Host "✅ Деплой завершён!" -ForegroundColor Green
}} else {{
    Write-Host "❌ Ошибка синхронизации!" -ForegroundColor Red
}}
'''
    return script_content

def main():
    print_banner("🚀 Setup FieldWorker Deployment")
    
    print("Добро пожаловать в установщик развертывания FieldWorker!")
    print("\nДоступные варианты:")
    print("1. Подготовить скрипты для автоматического развертывания")
    print("2. Вывести инструкции для ручной установки на сервер")
    print("3. Создать все скрипты в текущей директории")
    
    choice = input("\nВыберите вариант (1-3): ").strip()
    
    if choice == "1" or choice == "3":
        print_banner("📝 Информация о сервере")
        
        server_ip = input("IP адрес сервера (например, 192.168.1.100): ").strip()
        server_user = input("SSH пользователь (обычно ubuntu): ").strip() or "ubuntu"
        webhook_secret = input("GitHub Webhook Secret (оставить пусто для пропуска): ").strip() or "your-secret-key"
        
        # Создать директорию для скриптов
        scripts_dir = Path("deployment_scripts")
        if choice == "3":
            scripts_dir.mkdir(exist_ok=True)
            
            # Сохранить bash скрипт
            with open(scripts_dir / "deploy.sh", "w") as f:
                f.write(create_deploy_script())
            print(f"✅ Создан: {scripts_dir / 'deploy.sh'}")
            
            # Сохранить webhook скрипт
            with open(scripts_dir / "webhook.py", "w") as f:
                f.write(create_webhook_script())
            print(f"✅ Создан: {scripts_dir / 'webhook.py'}")
            
            # Сохранить systemd сервис
            with open(scripts_dir / "fieldworker-webhook.service", "w") as f:
                f.write(create_systemd_service(webhook_secret))
            print(f"✅ Создан: {scripts_dir / 'fieldworker-webhook.service'}")
            
            # Сохранить PowerShell скрипт для rsync
            with open(scripts_dir / "deploy-rsync.ps1", "w") as f:
                f.write(create_rsync_script(server_ip, server_user))
            print(f"✅ Создан: {scripts_dir / 'deploy-rsync.ps1'}")
            
            # Сохранить инструкции
            with open(scripts_dir / "README-DEPLOYMENT.txt", "w") as f:
                f.write(f"""🚀 DEPLOYMENT SCRIPTS FOR {server_ip}

SSH User: {server_user}

1. DEPLOY.SH (Bash - на сервере)
   - Остановить контейнеры
   - Обновить код из Git
   - Пересобрать Docker образы
   - Запустить контейнеры
   
   Использование:
   chmod +x deploy.sh
   ./deploy.sh
   
   Или добавить в crontab:
   0 * * * * /opt/fieldworker/deploy.sh >> /var/log/fieldworker-cron.log 2>&1

2. WEBHOOK.PY (Python - для GitHub webhooks)
   - Запускает deploy.sh при push в main
   - Требует Flask: pip install flask
   
   Использование:
   export GITHUB_WEBHOOK_SECRET={webhook_secret}
   python3 webhook.py
   
   Для автоматического запуска:
   Скопировать fieldworker-webhook.service в /etc/systemd/system/
   sudo systemctl enable fieldworker-webhook
   sudo systemctl start fieldworker-webhook

3. DEPLOY-RSYNC.PS1 (PowerShell - на локальном компьютере)
   - Синхронизирует файлы через rsync
   - Перезагружает контейнеры на сервере
   
   Использование:
   .\\deploy-rsync.ps1
   
   Требует:
   - rsync (установлено с Git for Windows)
   - SSH ключ для подключения к серверу

4. FIELDWORKER-WEBHOOK.SERVICE (systemd service)
   - Автоматический запуск webhook при перезагрузке
   
   Использование:
   sudo cp fieldworker-webhook.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable fieldworker-webhook
   sudo systemctl start fieldworker-webhook

QUICK START:
============

На сервере:
1. sudo apt update && sudo apt install -y docker.io docker-compose git python3-pip
2. mkdir -p /opt/fieldworker && cd /opt/fieldworker
3. git clone https://github.com/YOUR_USERNAME/MyJobInMap.git .
4. cp .env.example .env
5. # Отредактировать .env
6. docker-compose up -d --build
7. # Скопировать deploy.sh в /opt/fieldworker/
8. chmod +x deploy.sh

Для автоматических обновлений (выберите один из вариантов):
- Вариант A: Cron (каждый час)
  crontab -e
  0 * * * * /opt/fieldworker/deploy.sh
  
- Вариант B: GitHub Webhook (мгновенно при push)
  pip install flask
  python3 webhook.py
  # Добавить webhook на GitHub

На локальном компьютере:
- Использовать deploy-rsync.ps1 для синхронизации файлов
  .\\deploy-rsync.ps1

ПОДДЕРЖКА:
=========
Документация: docs/DEPLOYMENT.md
""")
            print(f"✅ Создана инструкция: {scripts_dir / 'README-DEPLOYMENT.txt'}")
            
            print(f"\n✅ Все скрипты созданы в директории '{scripts_dir}'")
            print("\nСледующие шаги:")
            print(f"1. Откройте {scripts_dir / 'README-DEPLOYMENT.txt'} для инструкций")
            print(f"2. Отправьте скрипты на сервер:")
            print(f"   scp -r {scripts_dir} {server_user}@{server_ip}:/opt/fieldworker/")
        else:
            print("\n" + "=" * 70)
            print("📋 ИНСТРУКЦИИ ДЛЯ БЫСТРОГО РАЗВЕРТЫВАНИЯ")
            print("=" * 70)
            
            print(f"\n1️⃣  ПОДГОТОВКА СЕРВЕРА ({server_ip})")
            print(f"""
ssh {server_user}@{server_ip}
sudo apt update && sudo apt install -y docker.io docker-compose git python3-pip
sudo usermod -aG docker {server_user}
newgrp docker
""")
            
            print(f"\n2️⃣  ПЕРВОНАЧАЛЬНАЯ УСТАНОВКА")
            print(f"""
mkdir -p /opt/fieldworker
cd /opt/fieldworker
git clone https://github.com/YOUR_USERNAME/MyJobInMap.git .
cp .env.example .env
# Отредактировать .env и добавить переменные
docker-compose up -d --build
""")
            
            print(f"\n3️⃣  АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ (выберите один)")
            print(f"""
ВАРИАНТ A: Cron (обновление каждый час)
crontab -e
# Добавить строку:
0 * * * * bash /opt/fieldworker/deploy.sh >> /var/log/fieldworker-cron.log 2>&1

ВАРИАНТ B: GitHub Webhook (обновление при push)
pip install flask
# Скопировать webhook.py и fieldworker-webhook.service
sudo cp fieldworker-webhook.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable fieldworker-webhook
sudo systemctl start fieldworker-webhook
# Добавить webhook на GitHub:
# Settings > Webhooks > Add webhook
# URL: http://{server_ip}:9000/webhook
# Secret: {webhook_secret}

ВАРИАНТ C: rsync с локального компьютера (Windows)
.\\deploy-rsync.ps1
""")
            
            print(f"\n4️⃣  МОНИТОРИНГ")
            print(f"""
# Проверить статус контейнеров
docker-compose ps

# Посмотреть логи
docker-compose logs -f

# Посмотреть логи конкретного контейнера
docker-compose logs -f api
""")
    
    elif choice == "2":
        print("\n📖 Полная документация доступна в: docs/DEPLOYMENT.md")
        print("\n✅ Откройте этот файл в текстовом редакторе для полных инструкций")
    
    else:
        print("❌ Неверный выбор")
        sys.exit(1)
    
    print_banner("✅ Завершено!")
    print("Для получения дополнительной помощи откройте: docs/DEPLOYMENT.md\n")

if __name__ == "__main__":
    main()
