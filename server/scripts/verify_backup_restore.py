"""Проверить миграции и pg_dump/pg_restore на двух временных PostgreSQL БД.

python scripts/verify_backup_restore.py --admin-url-env TEST_DATABASE_URL
Существующие базы не изменяются. Нужны CREATEDB и pg_dump/pg_restore в PATH.
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

import psycopg2
from psycopg2 import sql
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def checked_run(command, env):
    result = subprocess.run(command, env=env, capture_output=True, text=True)
    if result.returncode:
        # Параметры подключения и вывод внешней утилиты могут содержать секреты.
        raise RuntimeError(
            f"Проверка не прошла: {Path(command[0]).name}, код {result.returncode}"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--admin-url-env", default="TEST_DATABASE_URL")
    args = parser.parse_args()
    url = make_url(os.environ[args.admin_url_env])
    if url.get_backend_name() != "postgresql":
        raise ValueError("Для проверки нужен PostgreSQL URL")
    for binary in ("pg_dump", "pg_restore"):
        if not shutil.which(binary):
            raise RuntimeError(f"Не найден {binary}")
    token = uuid4().hex[:16]
    source, target = (
        f"fieldworker_restore_{token}_source",
        f"fieldworker_restore_{token}_target",
    )
    names = (source, target)
    admin = psycopg2.connect(
        host=url.host,
        port=url.port or 5432,
        user=url.username,
        password=url.password,
        dbname="postgres",
    )
    admin.autocommit = True
    created = []
    try:
        with admin.cursor() as cursor:
            for name in names:
                cursor.execute(
                    sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name))
                )
                created.append(name)
        env = os.environ.copy()
        env["DATABASE_URL"] = url.set(database=source).render_as_string(
            hide_password=False
        )
        checked_run([sys.executable, "-m", "app.migrate"], env)
        engine = create_engine(url.set(database=source))
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "INSERT INTO tasks (title, raw_address, status, version) VALUES (:title, :address, 'NEW', 1)"
                    ),
                    {"title": token, "address": "Проверка восстановления"},
                )
                revision = connection.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar_one()
        finally:
            engine.dispose()
        env.update(
            PGHOST=url.host or "localhost",
            PGPORT=str(url.port or 5432),
            PGUSER=url.username or "postgres",
            PGPASSWORD=url.password or "",
            PGDATABASE=source,
        )
        with tempfile.TemporaryDirectory(prefix="fieldworker-restore-") as directory:
            backup = str(Path(directory) / "verification.dump")
            checked_run(
                ["pg_dump", "--format=custom", "--no-owner", "--file", backup], env
            )
            env["PGDATABASE"] = target
            checked_run(
                [
                    "pg_restore",
                    "--exit-on-error",
                    "--no-owner",
                    "--no-acl",
                    "--dbname",
                    target,
                    backup,
                ],
                env,
            )
        restored = create_engine(url.set(database=target))
        try:
            with restored.connect() as connection:
                row = connection.execute(
                    text("SELECT raw_address, version FROM tasks WHERE title=:token"),
                    {"token": token},
                ).one()
                assert row[0] == "Проверка восстановления" and row[1] == 1
                assert (
                    connection.execute(
                        text("SELECT version_num FROM alembic_version")
                    ).scalar_one()
                    == revision
                )
                for table in (
                    "task_views",
                    "maintenance_plans",
                    "material_stocks",
                    "outbox_events",
                ):
                    connection.execute(text(f"SELECT COUNT(*) FROM {table}"))
        finally:
            restored.dispose()
        print("Миграции и восстановление PostgreSQL: OK")
    finally:
        with admin.cursor() as cursor:
            for name in reversed(created):
                if not re.fullmatch(
                    r"fieldworker_restore_[a-f0-9]{16}_(source|target)", name
                ):
                    raise ValueError("Небезопасное имя временной БД")
                cursor.execute(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=%s AND pid<>pg_backend_pid()",
                    (name,),
                )
                cursor.execute(sql.SQL("DROP DATABASE {}").format(sql.Identifier(name)))
        admin.close()


if __name__ == "__main__":
    main()
