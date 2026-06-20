"""
DB Backup Backend (dialect-aware)
=================================
Низкоуровневые примитивы бэкапа/восстановления БД для SQLite и PostgreSQL.
Оркестрация (pre-restore, аудит, настройки, ротация) — в backup_service /
backup_scheduler; здесь только «как снять дамп и как восстановить».

* **SQLite** — gzip-копия файла БД (``tasks_db_*.sqlite.gz``).
* **PostgreSQL** — ``pg_dump -Fc`` (custom-формат, уже сжат) → ``tasks_db_*.dump``;
  восстановление через ``pg_restore --clean --if-exists --no-owner``.

PostgreSQL-путь требует клиента ``pg_dump``/``pg_restore`` на PATH (в Docker —
пакет ``postgresql-client``). Бинарники переопределяются через ``PG_DUMP_BIN`` /
``PG_RESTORE_BIN`` (удобно для нестандартных установок и тестов).
"""

import gzip
import logging
import os
import shutil
import sqlite3
import subprocess
from datetime import datetime
from typing import Optional

from sqlalchemy.engine import make_url

from app.config import settings

logger = logging.getLogger(__name__)

SQLITE_SUFFIX = ".sqlite.gz"
PG_SUFFIX = ".dump"


class DBBackupError(Exception):
    """Ошибка операций бэкапа/восстановления БД."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def backup_suffix() -> str:
    """Расширение файла бэкапа для текущего диалекта."""
    return PG_SUFFIX if settings.is_postgres else SQLITE_SUFFIX


def is_valid_backup_name(name: str) -> bool:
    """Имя похоже на файл бэкапа (любой из поддерживаемых форматов)."""
    return name.endswith(SQLITE_SUFFIX) or name.endswith(PG_SUFFIX)


# --------------------------------------------------------------------- SQLite


def resolve_sqlite_db_path() -> str:
    """Абсолютный путь к файлу SQLite БД из DATABASE_URL."""
    db_url = settings.DATABASE_URL
    if not db_url.startswith("sqlite"):
        raise DBBackupError("Only supported for SQLite", 400)

    db_path = db_url.replace("sqlite:///", "")
    if db_path.startswith("./"):
        db_path = db_path[2:]
    if not os.path.isabs(db_path):
        db_path = os.path.join(settings.BASE_DIR.parent, db_path)

    if not os.path.exists(db_path):
        if os.path.exists("tasks.db"):
            return os.path.abspath("tasks.db")
        raise DBBackupError(f"Database file not found at {db_path}", 500)
    return db_path


def _sqlite_dump(dest_path: str) -> None:
    src = resolve_sqlite_db_path()
    with open(src, "rb") as f_in, gzip.open(dest_path, "wb", compresslevel=6) as f_out:
        shutil.copyfileobj(f_in, f_out)


def _sqlite_restore(backup_path: str) -> None:
    db_path = resolve_sqlite_db_path()
    temp_db_path = db_path + ".restore_temp"
    with gzip.open(backup_path, "rb") as f_in, open(temp_db_path, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    # Валидация: распакованный файл — корректная SQLite БД. Соединение
    # закрываем ДО удаления файла (иначе на Windows os.remove падает с
    # PermissionError на открытом файле).
    try:
        conn = sqlite3.connect(temp_db_path)
        try:
            conn.execute("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1")
        finally:
            conn.close()
    except sqlite3.Error as e:
        os.remove(temp_db_path)
        raise DBBackupError(f"Invalid SQLite file: {e}", 400)
    # Атомарная замена
    old_db_path = db_path + ".old"
    if os.path.exists(old_db_path):
        os.remove(old_db_path)
    os.rename(db_path, old_db_path)
    os.rename(temp_db_path, db_path)
    os.remove(old_db_path)


# ------------------------------------------------------------------ PostgreSQL


def _pg_params():
    url = make_url(settings.DATABASE_URL)
    return {
        "host": url.host or "localhost",
        "port": str(url.port or 5432),
        "user": url.username or "",
        "password": url.password or "",
        "dbname": url.database or "",
    }


def _pg_env(password: str) -> dict:
    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password
    return env


def _pg_command(tool: str, args: list) -> tuple:
    """Собрать (argv, env) для pg-утилиты: нативно или через ``docker exec``.

    Дамп идёт в stdout, restore читает stdin — поэтому путь к файлу здесь не
    участвует, и docker-режим работает одинаково (файл всегда на хосте).
    """
    p = _pg_params()
    container = (settings.BACKUP_PG_DOCKER_CONTAINER or "").strip()
    if container:
        # Внутри контейнера: подключение к локальному Postgres, пароль пробрасываем
        # через -e PGPASSWORD (env хоста в контейнер не попадает). -i — для stdin.
        cmd = ["docker", "exec", "-i", "-e", f"PGPASSWORD={p['password']}", container]
        cmd += [tool, "-h", "127.0.0.1", "-U", p["user"], "-d", p["dbname"], *args]
        return cmd, os.environ.copy()
    cmd = [tool, "-h", p["host"], "-p", p["port"], "-U", p["user"], "-d", p["dbname"]]
    cmd += args
    return cmd, _pg_env(p["password"])


def _run_pg(cmd: list, env: dict, what: str, *, stdout=None, stdin=None) -> None:
    logger.info("%s: %s", what, " ".join(c for c in cmd if not c.startswith("--")))
    try:
        subprocess.run(
            cmd, check=True, env=env, stdout=stdout, stdin=stdin, stderr=subprocess.PIPE
        )
    except FileNotFoundError as e:
        raise DBBackupError(
            f"{cmd[0]} не найден — установите postgresql-client "
            f"или задайте BACKUP_PG_DOCKER_CONTAINER для запуска через Docker",
            500,
        ) from e
    except subprocess.CalledProcessError as e:
        detail = (e.stderr or b"").decode(errors="replace")[-500:]
        raise DBBackupError(f"{what} failed: {detail}", 500) from e


def _pg_dump(dest_path: str) -> None:
    # -Fc — custom format (сжат), пригоден для pg_restore --clean; дамп в stdout
    cmd, env = _pg_command(settings.PG_DUMP_BIN, ["-Fc", "--no-owner"])
    try:
        with open(dest_path, "wb") as out:
            _run_pg(cmd, env, "pg_dump", stdout=out)
    except DBBackupError:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise


def _pg_restore(backup_path: str) -> None:
    # pg_restore без файлового аргумента читает архив из stdin
    cmd, env = _pg_command(
        settings.PG_RESTORE_BIN, ["--clean", "--if-exists", "--no-owner"]
    )
    with open(backup_path, "rb") as src:
        _run_pg(cmd, env, "pg_restore", stdin=src)


# ----------------------------------------------------------------- public API


def create_dump(dest_dir: str, prefix: str = "tasks_db") -> str:
    """Снять дамп текущей БД в dest_dir. Возвращает имя файла."""
    os.makedirs(dest_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{prefix}_{timestamp}{backup_suffix()}"
    dest_path = os.path.join(dest_dir, filename)

    if settings.is_postgres:
        _pg_dump(dest_path)
    elif settings.is_sqlite:
        _sqlite_dump(dest_path)
    else:
        raise DBBackupError("Unsupported database backend for backup", 400)
    return filename


def restore_dump(backup_path: str) -> None:
    """Восстановить БД из файла дампа (формат определяется по диалекту/имени)."""
    if settings.is_postgres:
        _pg_restore(backup_path)
    elif settings.is_sqlite:
        _sqlite_restore(backup_path)
    else:
        raise DBBackupError("Unsupported database backend for restore", 400)
