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


def _run(cmd: list, env: dict, what: str) -> None:
    logger.info("%s: %s", what, " ".join(c for c in cmd if not c.startswith("--")))
    try:
        subprocess.run(cmd, check=True, env=env, capture_output=True)
    except FileNotFoundError as e:
        raise DBBackupError(
            f"{cmd[0]} не найден — установите postgresql-client", 500
        ) from e
    except subprocess.CalledProcessError as e:
        detail = (e.stderr or b"").decode(errors="replace")[-500:]
        raise DBBackupError(f"{what} failed: {detail}", 500) from e


def _pg_dump(dest_path: str) -> None:
    p = _pg_params()
    cmd = [
        os.environ.get("PG_DUMP_BIN", "pg_dump"),
        "-Fc",  # custom format (сжат), пригоден для pg_restore --clean
        "--no-owner",
        "-h",
        p["host"],
        "-p",
        p["port"],
        "-U",
        p["user"],
        "-d",
        p["dbname"],
        "-f",
        dest_path,
    ]
    _run(cmd, _pg_env(p["password"]), "pg_dump")


def _pg_restore(backup_path: str) -> None:
    p = _pg_params()
    cmd = [
        os.environ.get("PG_RESTORE_BIN", "pg_restore"),
        "--clean",
        "--if-exists",
        "--no-owner",
        "-h",
        p["host"],
        "-p",
        p["port"],
        "-U",
        p["user"],
        "-d",
        p["dbname"],
        backup_path,
    ]
    _run(cmd, _pg_env(p["password"]), "pg_restore")


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
