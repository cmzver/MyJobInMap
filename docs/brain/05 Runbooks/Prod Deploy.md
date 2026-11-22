# Prod Deploy

Прод: `root@balalayka.duckdns.org`, `/opt/fieldworker`, стек
`docker-compose.postgres.yml` (+ WireGuard overlay). Ключ — `~/.ssh/fieldworker_deploy`.

## Перед выкаткой

1. `git status` чистый, `main` запушен, CI зелёный.
2. `server/venv/Scripts/python -m alembic heads` — одна head.
3. Код на проде = прошлой выкатке (могла выкатывать другая сессия): сравнить
   md5 `server/app/**/*.py` (без `\r`) с `git archive <прошлый коммит>`.
4. Бэкап:
   `pg_dump -U fieldworker -d fieldworker_db -Fc` из контейнера
   `fieldworker_postgres` + копии `server/.env` и корневого `.env` в
   `/var/backups/fieldworker/pre-release-<UTC>/`; проверить
   `pg_restore -l | grep -c 'TABLE DATA'`.

## Выкатка

`& '.\scripts\sync-update-server-preset.ps1' -Mode all` (или `server`/`portal`).
Миграции применяются при старте API. Проверить:
`alembic current`, `https://<домен>/health`, журналы `fieldworker_server` и
`fieldworker_worker`, что в бандле портала новая сборка.

## После

- Разовые скрипты миграций данных — внутри контейнера:
  `docker exec -e PYTHONPATH=/app -w /app fieldworker_server python scripts/<script>.py --dry-run`,
  затем без `--dry-run`.
- Caddy не перезапускать без согласия (он же фронтит «говорилку»).

## Защита сервера

С 2026-11-17 SSH принимает только ключи: настройки находятся в
`/etc/ssh/sshd_config.d/00-security-hardening.conf`, перед cloud-init.
Рабочие ключи — `fieldworker_deploy` и `tac_deploy`. Парольный доступ
не включать; подключение обоими ключами проверено после применения.
Fail2ban включён при загрузке, jail `sshd` читает journal и блокирует
через nftables. Проверка: `fail2ban-client status sshd`.

В Caddyfile запрет секретных путей выполняется до API и SPA fallback;
сохранять этот порядок при изменениях. После атомарной замены Caddyfile
файловый bind mount может продолжать видеть старый inode. Сверять SHA-256
файла на хосте и `/etc/caddy/Caddyfile` внутри контейнера. Для reload без
рестарта в таком случае скопировать проверенный файл через `docker cp`
в `fieldworker-caddy:/config/security-hardening/Caddyfile`, выполнить
`caddy validate`, затем `caddy reload` внутри контейнера с этим путём
и `--adapter caddyfile`. Файл `/opt/fieldworker/Caddyfile` тоже должен
содержать новую конфигурацию: он используется при следующем старте.

Подробности и бэкап: [[SECURITY_HARDENING_2026-11-17]].

## APK

`./gradlew --no-daemon :app:assembleDebug` (debug-ключ этой машины), проверить
`aapt2 dump badging` и `apksigner verify --print-certs`, загрузить через
`UpdateService().upload(...)` в контейнере `fieldworker_server`, сверить SHA-256
скачанного `/api/updates/download`.
