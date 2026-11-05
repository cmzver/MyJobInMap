# FieldWorker API Server
# Bookworm ships PostgreSQL 15 client tools, matching the production DB image.
# Newer pg_restore versions can emit SET statements unsupported by PostgreSQL 15.
FROM python:3.11-slim-bookworm

WORKDIR /app

# curl — для healthcheck; postgresql-client — для pg_dump/pg_restore
# (бэкап/восстановление БД при работе на PostgreSQL, см. services/db_backup.py)
# wireguard-tools/iproute2/iptables — для on-demand WG-доступа к домофонным
# панелям (используется только при BEWARD_WG_ENABLED=true; см.
# deploy/wireguard/README.md). Сами пакеты безвредны, если фича выключена.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl postgresql-client-15 wireguard-tools iproute2 iptables \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
# Ставим lock: все транзитивные версии закреплены и сверяются по хешам
COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock

# Copy application
COPY . .
# Деплой пакует рабочую копию Windows (CRLF) — sh-скрипт должен быть с LF
RUN sed -i 's/\r$//' scripts/start-api.sh

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser \
    && mkdir -p /app/uploads /app/backups /app/logs \
    && chown -R appuser:appuser /app

USER appuser

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Run server (production migrations are executed by a separate deploy job).
# Число процессов — WEB_CONCURRENCY, метрики — multiprocess (см. скрипт).
CMD ["sh", "scripts/start-api.sh"]
