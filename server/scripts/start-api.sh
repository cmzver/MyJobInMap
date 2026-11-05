#!/bin/sh
# Запуск API в контейнере.
#
# Число процессов — WEB_CONCURRENCY (uvicorn читает её сам, по умолчанию 1).
# Больше одного процесса — только с REALTIME_REDIS_ENABLED=true: шина
# WebSocket, лимитеры, бан-лист и лидер фоновых заданий живут в Redis.
#
# Метрики Prometheus всегда в multiprocess-режиме: процессы пишут значения в
# PROMETHEUS_MULTIPROC_DIR, /metrics суммирует их. Каталог чистится при старте
# контейнера — иначе счётчики прошлых запусков смешались бы с новыми.
set -e

export PROMETHEUS_MULTIPROC_DIR="${PROMETHEUS_MULTIPROC_DIR:-/tmp/prometheus-multiproc}"
rm -rf "$PROMETHEUS_MULTIPROC_DIR"
mkdir -p "$PROMETHEUS_MULTIPROC_DIR"

exec uvicorn main:app --host 0.0.0.0 --port 8001 "$@"
