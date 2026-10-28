"""Regression tests for public server entry points."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import main


def test_portal_fallback_rejects_path_outside_dist(tmp_path, monkeypatch):
    server_dir = tmp_path / "server"
    portal_dist = tmp_path / "portal" / "dist"
    server_dir.mkdir()
    portal_dist.mkdir(parents=True)
    (portal_dist / "index.html").write_text("portal", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("secret", encoding="utf-8")
    monkeypatch.setattr(main, "settings", SimpleNamespace(BASE_DIR=server_dir))

    with pytest.raises(HTTPException) as error:
        asyncio.run(main.portal_spa_fallback("../../secret.txt"))

    assert error.value.status_code == 404


def test_portal_fallback_serves_asset_inside_dist(tmp_path, monkeypatch):
    server_dir = tmp_path / "server"
    portal_dist = tmp_path / "portal" / "dist"
    server_dir.mkdir()
    portal_dist.mkdir(parents=True)
    asset = portal_dist / "asset.js"
    asset.write_text("ok", encoding="utf-8")
    monkeypatch.setattr(main, "settings", SimpleNamespace(BASE_DIR=server_dir))

    response = asyncio.run(main.portal_spa_fallback("asset.js"))

    assert response.path == asset.resolve()


def test_health_returns_503_without_leaking_database_error():
    class BrokenSession:
        def execute(self, _query):
            raise RuntimeError("database password should not leak")

    response = asyncio.run(main.health_check(db=BrokenSession()))

    assert response.status_code == 503
    assert b"database password should not leak" not in response.body


@pytest.mark.parametrize("query", ["size=0", "size=-1", "size=101", "page=0"])
def test_task_pagination_rejects_unsafe_bounds(client, auth_headers, query):
    response = client.get(f"/api/tasks?{query}", headers=auth_headers)

    assert response.status_code == 422
