"""Скрипт для добавления недостающих колонок в БД."""

import sqlite3

conn = sqlite3.connect("tasks.db")
cur = conn.cursor()

# Check existing columns in users table
cur.execute("PRAGMA table_info(users)")
existing = [row[1] for row in cur.fetchall()]
print("Existing columns in users:", existing)

# Check if organizations table exists
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row[0] for row in cur.fetchall()]
print("Tables:", tables)

# --- 1. Create organizations table if not exists ---
if "organizations" not in tables:
    print("\nCreating organizations table...")
    cur.execute("""
        CREATE TABLE organizations (
            id INTEGER PRIMARY KEY,
            name VARCHAR(200) NOT NULL UNIQUE,
            slug VARCHAR(100) NOT NULL UNIQUE,
            description TEXT,
            email VARCHAR(200),
            phone VARCHAR(50),
            address VARCHAR(500),
            is_active BOOLEAN DEFAULT 1 NOT NULL,
            max_users INTEGER DEFAULT 50 NOT NULL,
            max_tasks INTEGER DEFAULT 10000 NOT NULL,
            created_at DATETIME,
            updated_at DATETIME
        )
    """)
    cur.execute(
        "CREATE INDEX IF NOT EXISTS ix_organizations_name ON organizations(name)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS ix_organizations_slug ON organizations(slug)"
    )
    print("  Done!")
else:
    print("\norganizations table already exists")

# --- 2. Add missing columns to users ---
missing_users = {
    "organization_id": "INTEGER REFERENCES organizations(id)",
    "report_target": "VARCHAR(20) DEFAULT 'group'",
    "report_contact_phone": "VARCHAR(20)",
    "avatar_path": "VARCHAR(500)",
}
for col, typedef in missing_users.items():
    if col not in existing:
        print(f"Adding users.{col}...")
        cur.execute(f"ALTER TABLE users ADD COLUMN {col} {typedef}")
        print(f"  Done!")
    else:
        print(f"users.{col} already exists")

# --- 3. Add organization_id to tasks if missing ---
cur.execute("PRAGMA table_info(tasks)")
task_cols = [row[1] for row in cur.fetchall()]
if "organization_id" not in task_cols:
    print("Adding tasks.organization_id...")
    cur.execute(
        "ALTER TABLE tasks ADD COLUMN organization_id INTEGER REFERENCES organizations(id)"
    )
    print("  Done!")
else:
    print("tasks.organization_id already exists")

# --- 4. Add organization_id to addresses if missing ---
cur.execute("PRAGMA table_info(addresses)")
addr_cols = [row[1] for row in cur.fetchall()]
if "organization_id" not in addr_cols:
    print("Adding addresses.organization_id...")
    cur.execute(
        "ALTER TABLE addresses ADD COLUMN organization_id INTEGER REFERENCES organizations(id)"
    )
    print("  Done!")
else:
    print("addresses.organization_id already exists")

conn.commit()
conn.close()
print("\nAll done! Database schema updated.")
