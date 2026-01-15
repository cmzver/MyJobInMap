"""Добавляет колонку corpus в таблицу addresses"""
import sqlite3
import os

# Путь к БД относительно server/
db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'tasks.db')
print(f"DB path: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Проверяем, есть ли уже колонка
cursor.execute("PRAGMA table_info(addresses)")
columns = [col[1] for col in cursor.fetchall()]

if 'corpus' in columns:
    print("Column 'corpus' already exists")
else:
    cursor.execute("ALTER TABLE addresses ADD COLUMN corpus VARCHAR(20) DEFAULT ''")
    conn.commit()
    print("Column 'corpus' added successfully")

conn.close()
