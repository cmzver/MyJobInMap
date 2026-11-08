# ADR-0005 — Наружу только Caddy

## Status

Accepted (2026-11-08)

## Context

`docker-compose.postgres.yml` публиковал `5432:5432` и `8001:8001`. Docker
пишет правила в iptables в обход ufw, поэтому PostgreSQL был доступен из
интернета со стандартным паролем из compose (сканеры перебирали пароли), а API —
по голому HTTP мимо TLS.

## Decision

- Порты БД и API привязаны к `127.0.0.1` (`127.0.0.1:5432:5432`,
  `127.0.0.1:${PORT}:8001`). Caddy (`network_mode: host`) ходит на
  `localhost:8001`; наружу — только 80/443.
- Пароль БД сменён и задаётся `POSTGRES_PASSWORD` в корневом
  `/opt/fieldworker/.env` (подстановка compose); стандартный из compose не
  используется. Доступ к БД снаружи — SSH-туннель
  `ssh -L 5432:127.0.0.1:5432`.

## Consequences

Новые сервисы с портами — только на `127.0.0.1` или за Caddy. Устаревший
`DATABASE_URL` в `server/.env` на проде не используется (compose `environment`
перекрывает `env_file`).
