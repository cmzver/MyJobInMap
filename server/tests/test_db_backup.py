"""Тесты диалект-нейтрального бэкап-бэкенда (app/services/db_backup.py).

PostgreSQL-путь проверяется через подмену subprocess (бинарник pg_dump в CI не
нужен): валидируем argv и передачу пароля через PGPASSWORD. SQLite-путь —
реальный round-trip во временной директории.
"""

import sqlite3

import pytest

from app.config import settings
from app.services import db_backup

PG_URL = "postgresql+psycopg2://us:pw@dbhost:5544/mydb"


class TestSuffixAndName:
    def test_sqlite_suffix(self, monkeypatch):
        monkeypatch.setattr(settings, "DATABASE_URL", "sqlite:///./tasks.db")
        assert db_backup.backup_suffix() == ".sqlite.gz"

    def test_pg_suffix(self, monkeypatch):
        monkeypatch.setattr(settings, "DATABASE_URL", PG_URL)
        assert db_backup.backup_suffix() == ".dump"

    @pytest.mark.parametrize(
        "name,ok",
        [
            ("tasks_db_20240101.sqlite.gz", True),
            ("tasks_db_20240101.dump", True),
            ("evil.txt", False),
            ("backup.zip", False),
        ],
    )
    def test_is_valid_backup_name(self, name, ok):
        assert db_backup.is_valid_backup_name(name) is ok


class TestSqliteRoundTrip:
    def test_dump_and_restore(self, monkeypatch, tmp_path):
        db = tmp_path / "tasks.db"
        conn = sqlite3.connect(db)
        conn.execute("CREATE TABLE t (id INTEGER)")
        conn.execute("INSERT INTO t VALUES (1), (2), (3)")
        conn.commit()
        conn.close()

        monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{db}")

        backups = tmp_path / "backups"
        name = db_backup.create_dump(str(backups))
        assert name.endswith(".sqlite.gz")
        assert (backups / name).exists()

        # Портим БД, затем восстанавливаем из дампа
        conn = sqlite3.connect(db)
        conn.execute("DELETE FROM t")
        conn.commit()
        conn.close()

        db_backup.restore_dump(str(backups / name))

        conn = sqlite3.connect(db)
        count = conn.execute("SELECT COUNT(*) FROM t").fetchone()[0]
        conn.close()
        assert count == 3

    def test_restore_rejects_non_sqlite(self, monkeypatch, tmp_path):
        db = tmp_path / "tasks.db"
        db.write_bytes(b"SQLite format 3\x00")
        monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{db}")
        bad = tmp_path / "bad.sqlite.gz"
        import gzip

        with gzip.open(bad, "wb") as f:
            f.write(b"not a sqlite database at all")
        with pytest.raises(db_backup.DBBackupError):
            db_backup.restore_dump(str(bad))


class TestPostgresCommands:
    def _capture_run(self, monkeypatch):
        captured = {}

        def fake_run(cmd, check=True, env=None, stdout=None, stdin=None, stderr=None):
            captured["cmd"] = cmd
            captured["env"] = env or {}
            return None

        monkeypatch.setattr(db_backup.subprocess, "run", fake_run)
        return captured

    def test_pg_dump_argv_and_password(self, monkeypatch, tmp_path):
        monkeypatch.setattr(settings, "DATABASE_URL", PG_URL)
        monkeypatch.setattr(settings, "BACKUP_PG_DOCKER_CONTAINER", "")
        captured = self._capture_run(monkeypatch)

        name = db_backup.create_dump(str(tmp_path))
        assert name.endswith(".dump")

        cmd = captured["cmd"]
        assert cmd[0] == "pg_dump"
        assert "-Fc" in cmd and "--no-owner" in cmd
        assert "dbhost" in cmd and "5544" in cmd
        assert "us" in cmd and "mydb" in cmd
        assert captured["env"].get("PGPASSWORD") == "pw"

    def test_pg_restore_argv_and_password(self, monkeypatch, tmp_path):
        monkeypatch.setattr(settings, "DATABASE_URL", PG_URL)
        monkeypatch.setattr(settings, "BACKUP_PG_DOCKER_CONTAINER", "")
        captured = self._capture_run(monkeypatch)

        snap = tmp_path / "snap.dump"  # restore читает файл как stdin → должен быть
        snap.write_bytes(b"dump")
        db_backup.restore_dump(str(snap))

        cmd = captured["cmd"]
        assert cmd[0] == "pg_restore"
        assert "--clean" in cmd and "--if-exists" in cmd and "--no-owner" in cmd
        assert "mydb" in cmd
        assert captured["env"].get("PGPASSWORD") == "pw"

    def test_docker_exec_mode(self, monkeypatch, tmp_path):
        monkeypatch.setattr(settings, "DATABASE_URL", PG_URL)
        monkeypatch.setattr(settings, "BACKUP_PG_DOCKER_CONTAINER", "fw_pg")
        captured = self._capture_run(monkeypatch)

        db_backup.create_dump(str(tmp_path))

        cmd = captured["cmd"]
        # запуск через docker exec внутри контейнера, пароль — через -e
        assert cmd[:3] == ["docker", "exec", "-i"]
        assert "fw_pg" in cmd and "pg_dump" in cmd
        assert "-e" in cmd and "PGPASSWORD=pw" in cmd

    def test_missing_binary_raises_clear_error(self, monkeypatch, tmp_path):
        monkeypatch.setattr(settings, "DATABASE_URL", PG_URL)
        monkeypatch.setattr(settings, "BACKUP_PG_DOCKER_CONTAINER", "")

        def boom(cmd, check=True, env=None, stdout=None, stdin=None, stderr=None):
            raise FileNotFoundError(cmd[0])

        monkeypatch.setattr(db_backup.subprocess, "run", boom)
        with pytest.raises(db_backup.DBBackupError) as exc:
            db_backup.create_dump(str(tmp_path))
        assert "postgresql-client" in exc.value.message
