"""
Скрипт миграции: добавление колонок old_assignee и new_assignee в таблицу comments
"""
import sqlite3
import os

# Путь к базе данных (абсолютный)
db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'tasks.db')

print(f"DB path: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Проверяем существующие колонки
cursor.execute("PRAGMA table_info(comments)")
columns = [col[1] for col in cursor.fetchall()]
print(f"Current columns: {columns}")

# Добавляем old_assignee если её нет
if 'old_assignee' not in columns:
    cursor.execute("ALTER TABLE comments ADD COLUMN old_assignee VARCHAR")
    print("Column 'old_assignee' added successfully")
else:
    print("Column 'old_assignee' already exists")

# Добавляем new_assignee если её нет
if 'new_assignee' not in columns:
    cursor.execute("ALTER TABLE comments ADD COLUMN new_assignee VARCHAR")
    print("Column 'new_assignee' added successfully")
else:
    print("Column 'new_assignee' already exists")

conn.commit()
conn.close()
print("Migration completed!")
