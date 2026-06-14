"""Юнит-тесты для чистых хелперов IP-guard (без БД)."""

import pytest

from app.services.ip_guard import _ban_key, _is_internal_ip


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
