#!/usr/bin/env python3
"""
FieldWorker Database Migration Script
======================================
Скрипт для миграции данных из SQLite в PostgreSQL.

Использование:
    python migrate_to_postgres.py

Требования:
    - Настроенный .env с DATABASE_URL для PostgreSQL
    - Существующий tasks.db файл с данными
"""

import os
import sys
from datetime import datetime

# Проверяем наличие необходимых библиотек
try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
except ImportError:
    print("❌ SQLAlchemy не установлен. Установите: pip install sqlalchemy")
    sys.exit(1)

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    print("⚠️ python-dotenv не установлен, используем переменные окружения напрямую")


def get_sqlite_connection():
    """Получить соединение с SQLite"""
    sqlite_path = "sqlite:///./tasks.db"
    if not os.path.exists("tasks.db"):
        print("❌ Файл tasks.db не найден!")
        sys.exit(1)
    return create_engine(sqlite_path, connect_args={"check_same_thread": False})


def get_postgres_connection():
    """Получить соединение с PostgreSQL"""
    pg_url = os.getenv("DATABASE_URL")
    if not pg_url or not pg_url.startswith("postgresql"):
        print("❌ DATABASE_URL не настроен или не PostgreSQL!")
        print("   Установите переменную окружения DATABASE_URL:")
        print(
            "   export DATABASE_URL=postgresql://user:password@localhost:5432/fieldworker"
        )
        sys.exit(1)
    return create_engine(pg_url, pool_pre_ping=True)


def migrate_table(sqlite_engine, pg_engine, table_name: str):
    """Мигрировать таблицу из SQLite в PostgreSQL"""
    print(f"  📋 Мигрируем таблицу: {table_name}")

    with sqlite_engine.connect() as sqlite_conn:
        # Читаем данные из SQLite
        result = sqlite_conn.execute(text(f"SELECT * FROM {table_name}"))
        rows = result.fetchall()
        columns = result.keys()

        if not rows:
            print(f"     ⚠️ Таблица пуста")
            return 0

        # Формируем INSERT запрос
        columns_str = ", ".join(columns)
        placeholders = ", ".join([f":{col}" for col in columns])
        insert_sql = f"INSERT INTO {table_name} ({columns_str}) VALUES ({placeholders})"

        with pg_engine.connect() as pg_conn:
            # Очищаем таблицу (опционально)
            pg_conn.execute(text(f"DELETE FROM {table_name}"))

            # Вставляем данные
            for row in rows:
                row_dict = dict(zip(columns, row))
                pg_conn.execute(text(insert_sql), row_dict)

            # Обновляем sequence для автоинкремента
            if "id" in columns:
                max_id = max(row[0] for row in rows)
                pg_conn.execute(
                    text(
                        f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), {max_id}, true)"
                    )
                )

            pg_conn.commit()

        print(f"     ✅ Мигрировано записей: {len(rows)}")
        return len(rows)


def main():
    print("=" * 60)
    print("FieldWorker: Миграция SQLite → PostgreSQL")
    print("=" * 60)
    print()

    # Подключаемся к базам данных
    print("🔌 Подключение к базам данных...")
    sqlite_engine = get_sqlite_connection()
    pg_engine = get_postgres_connection()

    print("   SQLite: tasks.db")
    print(f"   PostgreSQL: {os.getenv('DATABASE_URL')[:50]}...")
    print()

    # Создаём таблицы в PostgreSQL (если не существуют)
    print("🏗️ Создание структуры БД в PostgreSQL...")
    from models import Base

    Base.metadata.create_all(bind=pg_engine)
    print("   ✅ Таблицы созданы")
    print()

    # Порядок миграции важен из-за foreign keys
    tables = ["settings", "users", "devices", "tasks", "comments"]

    print("📦 Миграция данных...")
    total_rows = 0
    for table in tables:
        try:
            total_rows += migrate_table(sqlite_engine, pg_engine, table)
        except Exception as e:
            print(f"     ❌ Ошибка: {e}")

    print()
    print("=" * 60)
    print(f"✅ Миграция завершена! Всего записей: {total_rows}")
    print("=" * 60)
    print()
    print("Следующие шаги:")
    print("1. Обновите DATABASE_URL в .env на PostgreSQL")
    print("2. Перезапустите сервер")
    print("3. Проверьте работу приложения")


if __name__ == "__main__":
    main()
