#!/bin/bash
# =============================================================================
# FieldWorker — Включение HTTPS с Caddy (замена nginx)
# =============================================================================
# Скрипт останавливает nginx и запускает Caddy для автоматического SSL.
#
# Использование:
#   bash /opt/fieldworker/scripts/enable-ssl.sh
#
# Требования:
#   - Docker и Docker Compose установлены
#   - Порт 80 доступен из интернета (для Let's Encrypt ACME challenge)
#   - DNS petrosyan.duckdns.org указывает на этот сервер
#   - Portal собран и скопирован в /var/www/fw/
# =============================================================================

set -euo pipefail

DOMAIN="${DOMAIN:-petrosyan.duckdns.org}"
PROJECT_DIR="${PROJECT_DIR:-/opt/fieldworker}"

echo "============================================"
echo "  FieldWorker — Включение HTTPS"
echo "  Домен: $DOMAIN"
echo "============================================"
echo ""

# --- 1. Проверки ---
echo "[1/5] Проверка предварительных условий..."

if ! command -v docker &>/dev/null; then
    echo "ОШИБКА: Docker не установлен"
    exit 1
fi

if ! docker compose version &>/dev/null; then
    echo "ОШИБКА: Docker Compose V2 не установлен"
    exit 1
fi

if [ ! -f "$PROJECT_DIR/Caddyfile" ]; then
    echo "ОШИБКА: $PROJECT_DIR/Caddyfile не найден"
    exit 1
fi

if [ ! -f "$PROJECT_DIR/docker-compose.caddy.yml" ]; then
    echo "ОШИБКА: $PROJECT_DIR/docker-compose.caddy.yml не найден"
    exit 1
fi

if [ ! -d "/var/www/fw" ]; then
    echo "ПРЕДУПРЕЖДЕНИЕ: /var/www/fw не найден. Портал не будет доступен."
fi

# Проверяем что API запущен
if curl -sf http://localhost:8001/health >/dev/null 2>&1; then
    echo "  ✓ API на localhost:8001 работает"
else
    echo "  ⚠ API на localhost:8001 не отвечает (запустите API перед включением SSL)"
fi

echo "  ✓ Проверки пройдены"
echo ""

# --- 2. Остановка nginx ---
echo "[2/5] Остановка nginx..."

if systemctl is-active --quiet nginx 2>/dev/null; then
    systemctl stop nginx
    systemctl disable nginx
    echo "  ✓ nginx остановлен и отключен"
else
    echo "  ✓ nginx уже остановлен"
fi
echo ""

# --- 3. Запуск Caddy ---
echo "[3/5] Запуск Caddy..."

cd "$PROJECT_DIR"
DOMAIN="$DOMAIN" docker compose -f docker-compose.caddy.yml up -d

echo "  ✓ Caddy запущен"
echo ""

# --- 4. Ожидание и проверка ---
echo "[4/5] Ожидание получения сертификата (до 30 сек)..."

for i in $(seq 1 6); do
    sleep 5
    if curl -sf "https://$DOMAIN/api/health" >/dev/null 2>&1; then
        echo "  ✓ HTTPS работает!"
        break
    fi
    if [ "$i" -eq 6 ]; then
        echo "  ⚠ HTTPS пока не готов. Caddy может ещё получать сертификат."
        echo "    Проверьте логи: docker compose -f docker-compose.caddy.yml logs -f"
    else
        echo "  ... ожидание ($((i * 5)) сек)"
    fi
done
echo ""

# --- 5. Итог ---
echo "[5/5] Готово!"
echo ""
echo "============================================"
echo "  HTTPS включен для $DOMAIN"
echo "============================================"
echo ""
echo "Проверка:"
echo "  curl -I https://$DOMAIN/api/health"
echo "  curl -I https://$DOMAIN/portal/"
echo ""
echo "Логи Caddy:"
echo "  docker compose -f $PROJECT_DIR/docker-compose.caddy.yml logs -f"
echo ""
echo "Откат (вернуть nginx):"
echo "  docker compose -f $PROJECT_DIR/docker-compose.caddy.yml down"
echo "  systemctl enable nginx && systemctl start nginx"
echo ""
