"""Dev seeding script for SQLite tasks.db.
Creates fresh sample users, tasks, and comments.
Usage: python scripts/seed_dev.py
"""
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
import bcrypt

DB_PATH = Path(__file__).resolve().parent.parent / "tasks.db"
NOW = datetime.now(timezone.utc)

USERS = [
    {
        "username": "admin",
        "password": "admin",
        "full_name": "Admin User",
        "role": "admin",
        "report_target": "group",
        "report_contact_phone": None,
    },
    {
        "username": "worker1",
        "password": "worker1",
        "full_name": "Ivan Field",
        "role": "worker",
        "report_target": "contact",
        "report_contact_phone": "+79990000001",
    },
    {
        "username": "worker2",
        "password": "worker2",
        "full_name": "Anna Service",
        "role": "worker",
        "report_target": "contact",
        "report_contact_phone": "+79990000002",
    },
]

TASKS = [
    {
        "task_number": "FW-0001",
        "title": "Emergency leak",
        "raw_address": "SPB, Nevsky prospect, 1",
        "description": "Leak reported, urgent dispatch required.",
        "lat": 59.935,
        "lon": 30.325,
        "status": "NEW",
        "priority": 4,
        "assigned_user_username": "worker1",
        "planned_date": NOW + timedelta(days=1),
        "is_remote": False,
        "is_paid": False,
        "payment_amount": 0.0,
    },
    {
        "task_number": "FW-0002",
        "title": "Riser repair",
        "raw_address": "SPB, Ligovsky pr., 50",
        "description": "Residents report flooding in the entrance.",
        "lat": 59.920,
        "lon": 30.355,
        "status": "IN_PROGRESS",
        "priority": 3,
        "assigned_user_username": "worker2",
        "planned_date": NOW + timedelta(days=2),
        "is_remote": False,
        "is_paid": True,
        "payment_amount": 2500.0,
    },
    {
        "task_number": "FW-0003",
        "title": "Planned inspection",
        "raw_address": "SPB, Moskovsky pr., 100",
        "description": "Scheduled preventive check.",
        "lat": 59.850,
        "lon": 30.318,
        "status": "DONE",
        "priority": 2,
        "assigned_user_username": "worker1",
        "planned_date": NOW - timedelta(days=1),
        "is_remote": True,
        "is_paid": False,
        "payment_amount": 0.0,
        "completed_at": NOW - timedelta(hours=4),
    },
    {
        "task_number": "FW-0004",
        "title": "Cancelled by client",
        "raw_address": "SPB, Bolshoy pr. PS, 30",
        "description": "Client cancelled the visit, keep for history.",
        "lat": 59.971,
        "lon": 30.293,
        "status": "CANCELLED",
        "priority": 1,
        "assigned_user_username": None,
        "planned_date": None,
        "is_remote": False,
        "is_paid": False,
        "payment_amount": 0.0,
    },
]

COMMENTS = [
    {
        "task_number": "FW-0001",
        "author": "Dispatcher",
        "text": "Task accepted, assigning crew.",
        "old_status": None,
        "new_status": "NEW",
    },
    {
        "task_number": "FW-0002",
        "author": "Anna Service",
        "text": "On site, work in progress.",
        "old_status": "NEW",
        "new_status": "IN_PROGRESS",
    },
    {
        "task_number": "FW-0003",
        "author": "Ivan Field",
        "text": "Work finished, photos and report attached.",
        "old_status": "IN_PROGRESS",
        "new_status": "DONE",
    },
]

TABLES = ["task_photos", "comments", "tasks", "devices", "users", "settings"]


def hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys=OFF;")
    cur = conn.cursor()

    # Clear tables
    for table in TABLES:
        cur.execute(f"DELETE FROM {table};")

    # Reset autoincrement if exists
    cur.execute("SELECT name FROM sqlite_master WHERE name='sqlite_sequence';")
    if cur.fetchone():
        for table in TABLES:
            cur.execute("DELETE FROM sqlite_sequence WHERE name=?;", (table,))

    username_to_id = {}
    for user in USERS:
        cur.execute(
            """
            INSERT INTO users (username, password_hash, full_name, role, is_active, created_at, last_login, report_target, report_contact_phone)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?);
            """,
            (
                user["username"],
                hash_pw(user["password"]),
                user["full_name"],
                user["role"],
                NOW.isoformat(sep=" "),
                NOW.isoformat(sep=" "),
                user["report_target"],
                user["report_contact_phone"],
            ),
        )
        username_to_id[user["username"]] = cur.lastrowid

    for task in TASKS:
        assigned_id = (
            username_to_id.get(task["assigned_user_username"])
            if task.get("assigned_user_username")
            else None
        )
        cur.execute(
            """
            INSERT INTO tasks (
                task_number, title, raw_address, description,
                lat, lon, status, priority, created_at, updated_at,
                planned_date, completed_at, assigned_user_id,
                is_remote, is_paid, payment_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                task["task_number"],
                task["title"],
                task["raw_address"],
                task["description"],
                task["lat"],
                task["lon"],
                task["status"],
                task["priority"],
                NOW.isoformat(sep=" "),
                NOW.isoformat(sep=" "),
                task.get("planned_date").isoformat(sep=" ") if task.get("planned_date") else None,
                task.get("completed_at").isoformat(sep=" ") if task.get("completed_at") else None,
                assigned_id,
                int(task["is_remote"]),
                int(task["is_paid"]),
                task["payment_amount"],
            ),
        )

    for comment in COMMENTS:
        cur.execute("SELECT id FROM tasks WHERE task_number=?;", (comment["task_number"],))
        row = cur.fetchone()
        if not row:
            continue
        task_id = row[0]
        cur.execute(
            """
            INSERT INTO comments (task_id, text, author, old_status, new_status, created_at)
            VALUES (?, ?, ?, ?, ?, ?);
            """,
            (
                task_id,
                comment["text"],
                comment["author"],
                comment["old_status"],
                comment["new_status"],
                NOW.isoformat(sep=" "),
            ),
        )

    conn.commit()
    conn.close()
    print("Seed completed. Users:", username_to_id)


if __name__ == "__main__":
    main()
