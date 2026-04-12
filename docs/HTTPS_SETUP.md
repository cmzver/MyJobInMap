# HTTPS Setup Guide / Настройка HTTPS

## Быстрый старт (Development)

### 1. Генерация самоподписанного сертификата

**Linux/macOS:**
```bash
cd server
chmod +x generate_ssl.sh
./generate_ssl.sh
```

**Windows (PowerShell):**
```powershell
cd server
mkdir ssl

# Генерация сертификата
openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
    -keyout ssl/fieldworker.key `
    -out ssl/fieldworker.crt `
    -subj "/C=RU/ST=SPb/L=SPb/O=FieldWorker/CN=localhost"
```

### 2. Запуск сервера с HTTPS

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 \
    --ssl-keyfile=ssl/fieldworker.key \
    --ssl-certfile=ssl/fieldworker.crt
```

### 3. Настройка Android приложения

В `AppPreferences.kt` измените URL сервера на:
```
https://10.0.2.2:8000
```

⚠️ **Важно:** Для самоподписанных сертификатов нужно настроить Network Security Config.

---

## Production Setup — Caddy (рекомендуется) ✅

Самый простой вариант: Caddy в Docker с автоматическим Let's Encrypt.
Caddy сам получает и обновляет сертификат, перенаправляет HTTP → HTTPS.

### Требования
- Docker и Docker Compose V2 на сервере
- Порт 80 и 443 доступны из интернета
- DNS домена указывает на IP сервера
- API запущен на `localhost:8001` (не в Docker)
- Portal собран в `/var/www/fw/`

### Запуск

```bash
# На сервере:
cd /opt/fieldworker
bash scripts/enable-ssl.sh
```

Или вручную:
```bash
# 1. Остановить nginx
sudo systemctl stop nginx
sudo systemctl disable nginx

# 2. Запустить Caddy
DOMAIN=petrosyan.duckdns.org docker compose -f docker-compose.caddy.yml up -d

# 3. Проверить
curl -I https://petrosyan.duckdns.org/api/health
```

### Файлы
- `Caddyfile` — конфигурация (проксирование API, раздача портала, WebSocket)
- `docker-compose.caddy.yml` — Docker Compose для Caddy (network_mode: host)
- `scripts/enable-ssl.sh` — скрипт активации

### Управление
```bash
# Логи
docker compose -f docker-compose.caddy.yml logs -f

# Перезапуск (после изменения Caddyfile)
docker compose -f docker-compose.caddy.yml restart

# Остановка + откат на nginx
docker compose -f docker-compose.caddy.yml down
sudo systemctl enable nginx && sudo systemctl start nginx
```

### Как работает автообновление
Caddy автоматически обновляет сертификат за ~30 дней до истечения.
Сертификаты хранятся в Docker volume `fieldworker_caddy_data` и переживают перезапуски.

---

## Production Setup (Let's Encrypt — ручной вариант)

### Вариант 1: Certbot (рекомендуется)

```bash
# Установка certbot
sudo apt install certbot

# Получение сертификата
sudo certbot certonly --standalone -d your-domain.com

# Сертификаты будут в:
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

### Вариант 2: Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Docker + Traefik (автоматический HTTPS)

Обновлённый `docker-compose.yml`:

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=your@email.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./letsencrypt:/letsencrypt"

  api:
    build: ./server
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`your-domain.com`)"
      - "traefik.http.routers.api.entrypoints=websecure"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
```

---

## Network Security Config (Android)

Для поддержки HTTPS в Android добавьте файл:

`app/src/main/res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Production: только HTTPS -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </base-config>
    
    <!-- Development: разрешаем локальные адреса -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">192.168.0.0/16</domain>
    </domain-config>
</network-security-config>
```

В `AndroidManifest.xml`:
```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
```
