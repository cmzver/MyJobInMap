#!/usr/bin/env python3
"""
Миграция: добавление колонки entrance в таблицу addresses
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.models import engine, get_db


def migrate():
    """Добавляет колонку entrance в таблицу addresses"""
    print("🚀 Добавление колонки entrance в таблицу addresses...")

    with engine.connect() as conn:
        # Проверяем, существует ли колонка
        result = conn.execute(text("PRAGMA table_info(addresses)"))
        columns = [row[1] for row in result.fetchall()]

        if "entrance" in columns:
            print("✅ Колонка entrance уже существует")
            return

        # Добавляем колонку
        conn.execute(text("""
            ALTER TABLE addresses 
            ADD COLUMN entrance VARCHAR(10) DEFAULT ''
        """))
        conn.commit()
        print("✅ Колонка entrance добавлена успешно!")


if __name__ == "__main__":
    migrate()
