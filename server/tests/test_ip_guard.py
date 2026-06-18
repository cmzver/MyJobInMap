"""Тесты IP-guard: чистые хелперы + поведение сервиса IPGuard с БД.

Сервис безопасности (анти-brute-force / анти-DDoS) держит persistent бан-лист
и белый список в БД и кэширует их в памяти. Здесь каждый тест работает на
СВЕЖЕМ экземпляре :class:`IPGuard` (а не на глобальном singleton ``ip_guard``,
который autouse-фикстура conftest делает сквозным), чтобы изолированно
проверить реальную логику принятия решений.
"""

from datetime import timedelta

import pytest

from app.config import settings as app_config
from app.models.base import utcnow
from app.models.security import (
    BlockedIPModel,
    IPAllowlistModel,
    IPSecurityEventModel,
)
from app.models.settings import SystemSettingModel
from app.services.ip_guard import (
    IPGuard,
    _ban_key,
    _is_internal_ip,
    _to_epoch,
)
from app.services.rate_limiter import RateLimiter

# Реально публичный адрес: документационные диапазоны (203.0.113.0/24,
# 198.51.100.0/24) в современном Python трактуются как private — авто-бан их
# не тронет, поэтому для проверок enforcement берём настоящий публичный IP.
EXTERNAL_IP = "8.8.8.8"


@pytest.fixture
def guard():
    """Свежий, изолированный экземпляр IPGuard на каждый тест."""
    return IPGuard()


def _set_typed(db, key, value, value_type, label=None):
    """Создать типизированную системную настройку (get_setting её распарсит)."""
    db.add(
        SystemSettingModel(
            key=key, value=str(value), value_type=value_type, label=label or key
        )
    )
    db.commit()


class FakeClient:
    def __init__(self, host):
        self.host = host


class FakeRequest:
    def __init__(self, headers=None, client_host=None):
        self.headers = headers or {}
        self.client = FakeClient(client_host) if client_host else None


# ---------------------------------------------------------------- pure helpers


class TestBanKey:
    def test_ipv4_is_exact(self):
        assert _ban_key("203.0.113.7") == "203.0.113.7"

    def test_ipv6_collapses_to_64(self):
        assert _ban_key("2001:db8:1:2:aaaa:bbbb:cccc:dddd") == "2001:db8:1:2::/64"

    def test_ipv6_same_prefix_same_key(self):
        # Ротация адресов внутри одного /64 не должна обходить бан/счётчик
        assert _ban_key("2001:db8:1:2::1") == _ban_key("2001:db8:1:2:ffff::9")

    def test_ipv6_different_prefix_differs(self):
        assert _ban_key("2001:db8:1:2::1") != _ban_key("2001:db8:1:3::1")

    def test_unparseable_passthrough(self):
        assert _ban_key("not-an-ip") == "not-an-ip"


class TestIsInternalIp:
    @pytest.mark.parametrize(
        "ip",
        [
            "127.0.0.1",
            "::1",
            "10.0.0.5",
            "192.168.1.1",
            "172.16.0.1",
            "169.254.0.1",
            "fd00::1",
            "0.0.0.0",
        ],
    )
    def test_internal_addresses(self, ip):
        assert _is_internal_ip(ip) is True

    @pytest.mark.parametrize("ip", ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    def test_external_addresses(self, ip):
        assert _is_internal_ip(ip) is False

    def test_ipv6_64_network_string_external(self):
        # _ban_key отдаёт /64-строку — _is_internal_ip должен её понять
        assert _is_internal_ip("2606:4700:4700::/64") is False

    def test_unparseable_is_treated_internal(self):
        # fail-safe: что не распарсили — не баним
        assert _is_internal_ip("garbage") is True


class TestToEpoch:
    def test_naive_datetime_treated_as_utc(self):
        from datetime import datetime, timezone

        naive = datetime(2026, 1, 1, 12, 0, 0)
        aware = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        assert _to_epoch(naive) == aware.timestamp()


# --------------------------------------------------------------- get_client_ip


class TestGetClientIp:
    def test_uses_request_client_when_proxy_untrusted(self, guard, monkeypatch):
        monkeypatch.setattr(app_config, "TRUST_PROXY_HEADERS", False)
        req = FakeRequest(headers={"x-forwarded-for": "1.2.3.4"}, client_host="9.9.9.9")
        # Заголовкам не доверяем — XFF игнорируется
        assert guard.get_client_ip(req) == "9.9.9.9"

    def test_fallback_loopback_when_no_client(self, guard, monkeypatch):
        monkeypatch.setattr(app_config, "TRUST_PROXY_HEADERS", False)
        assert guard.get_client_ip(FakeRequest()) == "127.0.0.1"

    def test_xff_first_address_when_trusted(self, guard, monkeypatch):
        monkeypatch.setattr(app_config, "TRUST_PROXY_HEADERS", True)
        req = FakeRequest(
            headers={"x-forwarded-for": "203.0.113.7, 10.0.0.1"},
            client_host="10.0.0.1",
        )
        assert guard.get_client_ip(req) == "203.0.113.7"

    def test_x_real_ip_when_no_xff(self, guard, monkeypatch):
        monkeypatch.setattr(app_config, "TRUST_PROXY_HEADERS", True)
        req = FakeRequest(headers={"x-real-ip": "198.51.100.5"}, client_host="10.0.0.1")
        assert guard.get_client_ip(req) == "198.51.100.5"

    def test_trusted_but_no_headers_falls_back_to_client(self, guard, monkeypatch):
        monkeypatch.setattr(app_config, "TRUST_PROXY_HEADERS", True)
        assert guard.get_client_ip(FakeRequest(client_host="9.9.9.9")) == "9.9.9.9"


# -------------------------------------------------------------------- block_ip


class TestBlockIp:
    def test_creates_temporary_ban(self, guard, db_session):
        row = guard.block_ip(
            db_session, EXTERNAL_IP, reason="test", duration_minutes=30
        )
        assert row is not None
        assert row.expires_at is not None
        assert row.is_permanent is False
        # попал в in-memory кэш
        assert EXTERNAL_IP in guard._blocked
        # записано событие
        evt = (
            db_session.query(IPSecurityEventModel)
            .filter(IPSecurityEventModel.ip_address == EXTERNAL_IP)
            .first()
        )
        assert evt is not None and evt.event_type == "auto_banned"

    def test_permanent_ban_has_no_expiry(self, guard, db_session):
        row = guard.block_ip(db_session, EXTERNAL_IP, reason="perma", permanent=True)
        assert row.expires_at is None
        assert row.is_permanent is True
        assert guard._blocked[EXTERNAL_IP] is None

    def test_updates_existing_ban(self, guard, db_session):
        guard.block_ip(db_session, EXTERNAL_IP, reason="first", duration_minutes=10)
        guard.block_ip(db_session, EXTERNAL_IP, reason="second", duration_minutes=10)
        rows = (
            db_session.query(BlockedIPModel)
            .filter(BlockedIPModel.ip_address == EXTERNAL_IP)
            .all()
        )
        assert len(rows) == 1
        assert rows[0].reason == "second"

    def test_auto_ban_of_internal_ip_rejected(self, guard, db_session):
        assert guard.block_ip(db_session, "127.0.0.1", reason="self-dos") is None
        assert (
            db_session.query(BlockedIPModel)
            .filter(BlockedIPModel.ip_address == "127.0.0.1")
            .first()
            is None
        )

    def test_manual_ban_of_internal_ip_allowed(self, guard, db_session):
        row = guard.block_ip(
            db_session, "192.168.1.10", reason="manual", is_manual=True
        )
        assert row is not None

    def test_default_duration_from_config(self, guard, db_session):
        # duration_minutes не задан → берётся ip_ban_minutes (по умолчанию 60)
        row = guard.block_ip(db_session, EXTERNAL_IP, reason="default-dur")
        delta = row.expires_at - row.created_at
        assert abs(delta - timedelta(minutes=60)) < timedelta(seconds=5)


# ------------------------------------------------------------------ unblock_ip


class TestUnblockIp:
    def test_unblock_existing(self, guard, db_session):
        guard.block_ip(db_session, EXTERNAL_IP, reason="x", is_manual=True)
        assert guard.unblock_ip(db_session, EXTERNAL_IP) is True
        assert (
            db_session.query(BlockedIPModel)
            .filter(BlockedIPModel.ip_address == EXTERNAL_IP)
            .first()
            is None
        )
        assert EXTERNAL_IP not in guard._blocked

    def test_unblock_missing_returns_false(self, guard, db_session):
        assert guard.unblock_ip(db_session, "198.51.100.99") is False


# ------------------------------------------------------------------- allowlist


class TestAllowlist:
    def test_add_creates_entry(self, guard, db_session):
        row = guard.add_to_allowlist(db_session, EXTERNAL_IP, note="office")
        assert row.note == "office"
        assert EXTERNAL_IP in guard._allow

    def test_add_updates_note_and_clears_ban(self, guard, db_session):
        guard.block_ip(db_session, EXTERNAL_IP, reason="x", is_manual=True)
        guard.add_to_allowlist(db_session, EXTERNAL_IP, note="trusted")
        # активный бан снят
        assert (
            db_session.query(BlockedIPModel)
            .filter(BlockedIPModel.ip_address == EXTERNAL_IP)
            .first()
            is None
        )
        assert EXTERNAL_IP not in guard._blocked
        # повторное добавление обновляет заметку, не плодит строки
        guard.add_to_allowlist(db_session, EXTERNAL_IP, note="updated")
        rows = (
            db_session.query(IPAllowlistModel)
            .filter(IPAllowlistModel.ip_address == EXTERNAL_IP)
            .all()
        )
        assert len(rows) == 1 and rows[0].note == "updated"

    def test_remove_existing(self, guard, db_session):
        guard.add_to_allowlist(db_session, EXTERNAL_IP)
        assert guard.remove_from_allowlist(db_session, EXTERNAL_IP) is True
        assert EXTERNAL_IP not in guard._allow

    def test_remove_missing_returns_false(self, guard, db_session):
        assert guard.remove_from_allowlist(db_session, "198.51.100.99") is False


# ----------------------------------------------------------- login bruteforce


class TestLoginFailure:
    def test_bans_after_threshold(self, guard, db_session):
        _set_typed(db_session, "ip_autoban_threshold", 3, "int")
        for _ in range(3):
            guard.record_login_failure(db_session, EXTERNAL_IP, username="root")
        banned = (
            db_session.query(BlockedIPModel)
            .filter(BlockedIPModel.ip_address == EXTERNAL_IP)
            .first()
        )
        assert banned is not None

    def test_below_threshold_no_ban(self, guard, db_session):
        _set_typed(db_session, "ip_autoban_threshold", 5, "int")
        for _ in range(2):
            guard.record_login_failure(db_session, EXTERNAL_IP, username="root")
        assert (
            db_session.query(BlockedIPModel)
            .filter(BlockedIPModel.ip_address == EXTERNAL_IP)
            .first()
            is None
        )

    def test_internal_ip_never_auto_banned(self, guard, db_session):
        _set_typed(db_session, "ip_autoban_threshold", 1, "int")
        for _ in range(3):
            guard.record_login_failure(db_session, "127.0.0.1", username="root")
        assert (
            db_session.query(BlockedIPModel)
            .filter(BlockedIPModel.ip_address == "127.0.0.1")
            .first()
            is None
        )

    def test_allowlisted_ip_not_banned(self, guard, db_session):
        _set_typed(db_session, "ip_autoban_threshold", 1, "int")
        guard.add_to_allowlist(db_session, EXTERNAL_IP)
        for _ in range(3):
            guard.record_login_failure(db_session, EXTERNAL_IP, username="root")
        assert (
            db_session.query(BlockedIPModel)
            .filter(BlockedIPModel.ip_address == EXTERNAL_IP)
            .first()
            is None
        )

    def test_protection_disabled_skips_ban(self, guard, db_session):
        _set_typed(db_session, "ip_protection_enabled", "false", "bool")
        _set_typed(db_session, "ip_autoban_threshold", 1, "int")
        for _ in range(3):
            guard.record_login_failure(db_session, EXTERNAL_IP, username="root")
        assert (
            db_session.query(BlockedIPModel)
            .filter(BlockedIPModel.ip_address == EXTERNAL_IP)
            .first()
            is None
        )

    def test_success_resets_counter_without_dropping_history(self, guard, db_session):
        _set_typed(db_session, "ip_autoban_threshold", 3, "int")
        # 2 неудачи, успех (сброс счётчика), ещё 2 неудачи → порог 3 не достигнут
        guard.record_login_failure(db_session, EXTERNAL_IP, username="root")
        guard.record_login_failure(db_session, EXTERNAL_IP, username="root")
        guard.record_login_success(db_session, EXTERNAL_IP, username="root")
        guard.record_login_failure(db_session, EXTERNAL_IP, username="root")
        guard.record_login_failure(db_session, EXTERNAL_IP, username="root")
        assert (
            db_session.query(BlockedIPModel)
            .filter(BlockedIPModel.ip_address == EXTERNAL_IP)
            .first()
            is None
        )
        # история не удалена: остались все события login_failed
        failures = (
            db_session.query(IPSecurityEventModel)
            .filter(
                IPSecurityEventModel.ip_address == EXTERNAL_IP,
                IPSecurityEventModel.event_type == "login_failed",
            )
            .count()
        )
        assert failures == 4


# -------------------------------------------------------------------- evaluate


class TestEvaluate:
    def test_internal_ip_passes(self, guard, db_session):
        assert guard.evaluate(db_session, "127.0.0.1") is None

    def test_allowlisted_ip_passes(self, guard, db_session):
        guard.add_to_allowlist(db_session, EXTERNAL_IP)
        guard.refresh(db_session, force=True)
        assert guard.evaluate(db_session, EXTERNAL_IP) is None

    def test_active_ban_returns_403(self, guard, db_session):
        guard.block_ip(
            db_session,
            EXTERNAL_IP,
            reason="banned",
            duration_minutes=30,
            is_manual=True,
        )
        guard.refresh(db_session, force=True)
        result = guard.evaluate(db_session, EXTERNAL_IP)
        assert result is not None
        assert result["status"] == 403
        assert result["reason"] == "blocked"

    def test_expired_ban_is_ignored(self, guard, db_session):
        # бан в прошлом — загружаем в кэш напрямую и проверяем, что evaluate
        # его игнорирует и вычищает из кэша
        guard._blocked[EXTERNAL_IP] = (utcnow() - timedelta(minutes=1)).timestamp()
        guard._cache_at = __import__("time").time()  # не дать refresh перезатереть
        guard._cfg["ddos_protection_enabled"] = False
        assert guard.evaluate(db_session, EXTERNAL_IP) is None
        assert EXTERNAL_IP not in guard._blocked

    def test_ddos_exceeded_returns_429_and_bans(self, guard, db_session):
        guard.refresh(db_session, force=True)
        guard._cfg["ddos_protection_enabled"] = True
        guard._cfg["ip_protection_enabled"] = True
        guard._ddos = RateLimiter(max_attempts=2, window_seconds=60)
        assert guard.evaluate(db_session, EXTERNAL_IP) is None
        assert guard.evaluate(db_session, EXTERNAL_IP) is None
        result = guard.evaluate(db_session, EXTERNAL_IP)
        assert result is not None and result["status"] == 429
        # авто-бан зафиксирован в БД
        assert (
            db_session.query(BlockedIPModel)
            .filter(BlockedIPModel.ip_address == EXTERNAL_IP)
            .first()
            is not None
        )


# --------------------------------------------------------------------- refresh


class TestRefresh:
    def test_loads_blocked_and_allow_from_db(self, guard, db_session):
        db_session.add(
            BlockedIPModel(ip_address=EXTERNAL_IP, is_permanent=True, reason="x")
        )
        db_session.add(IPAllowlistModel(ip_address="198.51.100.5"))
        db_session.commit()
        guard.refresh(db_session, force=True)
        assert EXTERNAL_IP in guard._blocked
        assert "198.51.100.5" in guard._allow

    def test_prunes_expired_bans(self, guard, db_session):
        db_session.add(
            BlockedIPModel(
                ip_address=EXTERNAL_IP,
                is_permanent=False,
                expires_at=utcnow() - timedelta(minutes=5),
                reason="old",
            )
        )
        db_session.commit()
        guard.refresh(db_session, force=True)
        # истёкший бан удалён из БД
        assert (
            db_session.query(BlockedIPModel)
            .filter(BlockedIPModel.ip_address == EXTERNAL_IP)
            .first()
            is None
        )

    def test_cache_ttl_skips_reload(self, guard, db_session):
        guard.refresh(db_session, force=True)
        db_session.add(IPAllowlistModel(ip_address="198.51.100.7"))
        db_session.commit()
        # в пределах CACHE_TTL без force не перечитывает
        guard.refresh(db_session, force=False)
        assert "198.51.100.7" not in guard._allow
        # force=True — перечитывает
        guard.refresh(db_session, force=True)
        assert "198.51.100.7" in guard._allow


# ----------------------------------------------------------------- misc state


class TestStateHelpers:
    def test_runtime_stats_returns_dict(self, guard):
        stats = guard.runtime_stats()
        assert isinstance(stats, dict)

    def test_reset_clears_state(self, guard, db_session):
        guard.block_ip(db_session, EXTERNAL_IP, reason="x", is_manual=True)
        guard.add_to_allowlist(db_session, "198.51.100.5")
        guard.reset()
        assert guard._blocked == {}
        assert guard._allow == set()
