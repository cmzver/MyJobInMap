#!/bin/bash
# ============================================================================
# FieldWorker SSL Certificate Generator
# ============================================================================
# Генерирует самоподписанный SSL сертификат для разработки
# Для production используйте Let's Encrypt или коммерческий сертификат
#
# Использование: ./generate_ssl.sh
# ============================================================================

CERT_DIR="./ssl"
CERT_NAME="fieldworker"
DAYS_VALID=365

echo "============================================"
echo "FieldWorker SSL Certificate Generator"
echo "============================================"
echo ""

# Создаём директорию для сертификатов
mkdir -p $CERT_DIR

# Генерируем приватный ключ и сертификат
openssl req -x509 -nodes -days $DAYS_VALID -newkey rsa:2048 \
    -keyout $CERT_DIR/$CERT_NAME.key \
    -out $CERT_DIR/$CERT_NAME.crt \
    -subj "/C=RU/ST=Saint-Petersburg/L=SPb/O=FieldWorker/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:10.0.2.2"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Сертификаты созданы успешно!"
    echo ""
    echo "📁 Файлы:"
    echo "   - $CERT_DIR/$CERT_NAME.crt (сертификат)"
    echo "   - $CERT_DIR/$CERT_NAME.key (приватный ключ)"
    echo ""
    echo "🚀 Запуск сервера с HTTPS:"
    echo "   uvicorn main:app --host 0.0.0.0 --port 8000 \\"
    echo "       --ssl-keyfile=$CERT_DIR/$CERT_NAME.key \\"
    echo "       --ssl-certfile=$CERT_DIR/$CERT_NAME.crt"
    echo ""
    echo "⚠️  Для production используйте Let's Encrypt!"
else
    echo ""
    echo "❌ Ошибка генерации сертификатов"
    echo "   Убедитесь, что OpenSSL установлен"
fi
