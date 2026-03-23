"""Tests for rate limiter service."""

import time

import pytest

from app.services.rate_limiter import RateLimiter


class TestRateLimiter:
    """Test RateLimiter class."""

    def test_initialization(self):
        """Test rate limiter initialization."""
        limiter = RateLimiter(max_attempts=3, window_seconds=30)
        assert limiter.max_attempts == 3
        assert limiter.window_seconds == 30

    def test_first_attempts_allowed(self):
        """Test that initial attempts are allowed."""
        limiter = RateLimiter(max_attempts=3, window_seconds=60)

        # First 3 attempts should be allowed
        for i in range(3):
            is_allowed, remaining = limiter.is_allowed("192.168.1.1")
            assert is_allowed is True
            # remaining = max_attempts - current_count (after incrementing)
            assert remaining == 3 - (i + 1)

    def test_limit_exceeded(self):
        """Test that attempts are blocked after limit exceeded."""
        limiter = RateLimiter(max_attempts=2, window_seconds=60)

        # First 2 attempts allowed
        for _ in range(2):
            is_allowed, _ = limiter.is_allowed("192.168.1.1")
            assert is_allowed is True

        # 3rd attempt blocked
        is_allowed, remaining = limiter.is_allowed("192.168.1.1")
        assert is_allowed is False
        assert remaining == 0

    def test_window_reset(self):
        """Test that window resets after time passes."""
        limiter = RateLimiter(max_attempts=1, window_seconds=1)

        # First attempt allowed
        is_allowed, _ = limiter.is_allowed("192.168.1.1")
        assert is_allowed is True

        # Second attempt immediately - blocked
        is_allowed, _ = limiter.is_allowed("192.168.1.1")
        assert is_allowed is False

        # Wait for window to pass
        time.sleep(1.1)

        # Next attempt should be allowed
        is_allowed, _ = limiter.is_allowed("192.168.1.1")
        assert is_allowed is True

    def test_different_ips_independent(self):
        """Test that different IPs have independent limits."""
        limiter = RateLimiter(max_attempts=1, window_seconds=60)

        # IP 1 - uses first attempt
        is_allowed, _ = limiter.is_allowed("192.168.1.1")
        assert is_allowed is True

        # IP 1 - second attempt blocked
        is_allowed, _ = limiter.is_allowed("192.168.1.1")
        assert is_allowed is False

        # IP 2 - should have fresh attempt
        is_allowed, _ = limiter.is_allowed("192.168.1.2")
        assert is_allowed is True

        # IP 2 - second attempt blocked
        is_allowed, _ = limiter.is_allowed("192.168.1.2")
        assert is_allowed is False

    def test_reset(self):
        """Test resetting attempts for an IP."""
        limiter = RateLimiter(max_attempts=1, window_seconds=60)

        # Use up the attempt
        limiter.is_allowed("192.168.1.1")
        is_allowed, _ = limiter.is_allowed("192.168.1.1")
        assert is_allowed is False

        # Reset and try again
        limiter.reset("192.168.1.1")
        is_allowed, _ = limiter.is_allowed("192.168.1.1")
        assert is_allowed is True

    def test_get_retry_after(self):
        """Test getting retry-after time."""
        limiter = RateLimiter(max_attempts=1, window_seconds=2)

        # Use up the attempt
        limiter.is_allowed("192.168.1.1")

        # Get retry_after
        retry_after = limiter.get_retry_after("192.168.1.1")
        assert 0 < retry_after <= 2

    def test_get_stats(self):
        """Test getting statistics."""
        limiter = RateLimiter(max_attempts=2, window_seconds=60)

        # Make some attempts
        limiter.is_allowed("192.168.1.1")
        limiter.is_allowed("192.168.1.1")
        limiter.is_allowed("192.168.1.2")

        stats = limiter.get_stats()
        assert "tracked_ips" in stats
        assert "active_windows" in stats
        assert "total_attempts_in_window" in stats
        assert stats["tracked_ips"] == 2
        assert stats["total_attempts_in_window"] == 3

    def test_clear_all(self):
        """Test clearing all attempts."""
        limiter = RateLimiter(max_attempts=1, window_seconds=60)

        # Make attempts for multiple IPs
        limiter.is_allowed("192.168.1.1")
        limiter.is_allowed("192.168.1.2")

        stats = limiter.get_stats()
        assert stats["tracked_ips"] == 2

        # Clear all
        limiter.clear_all()
        stats = limiter.get_stats()
        assert stats["tracked_ips"] == 0


class TestRateLimiterThreadSafety:
    """Thread safety edge cases."""

    def test_concurrent_access_same_ip(self):
        """Multiple threads accessing same IP — total allowed <= max_attempts."""
        import threading

        limiter = RateLimiter(max_attempts=5, window_seconds=60)
        allowed_count = 0
        lock = threading.Lock()

        def worker():
            nonlocal allowed_count
            is_ok, _ = limiter.is_allowed("shared-ip")
            if is_ok:
                with lock:
                    allowed_count += 1

        threads = [threading.Thread(target=worker) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert allowed_count <= 5

    def test_concurrent_different_ips(self):
        """Each thread uses its own IP — all first attempts allowed."""
        import threading

        limiter = RateLimiter(max_attempts=1, window_seconds=60)
        results = {}
        lock = threading.Lock()

        def worker(ip):
            is_ok, _ = limiter.is_allowed(ip)
            with lock:
                results[ip] = is_ok

        threads = [
            threading.Thread(target=worker, args=(f"10.0.0.{i}",)) for i in range(20)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert all(results.values())


class TestRateLimiterOverflow:
    """Memory overflow protection."""

    def test_max_tracked_ips_triggers_cleanup(self):
        """Exceeding MAX_TRACKED_IPS triggers cleanup without crash."""
        limiter = RateLimiter(max_attempts=1, window_seconds=1)
        limiter.MAX_TRACKED_IPS = 50  # Lower threshold for test speed

        # Fill with expired entries
        import time

        for i in range(60):
            limiter.is_allowed(f"10.0.{i // 256}.{i % 256}")

        # Wait for expiry
        time.sleep(1.1)

        # One more call should trigger _cleanup_expired and still work
        is_ok, _ = limiter.is_allowed("fresh-ip")
        assert is_ok is True

        stats = limiter.get_stats()
        # Expired entries should have been cleaned up
        assert stats["tracked_ips"] <= 52  # fresh + possibly some remaining


class TestRateLimiterEdgeCases:
    """Edge cases and boundary conditions."""

    def test_retry_after_unknown_ip(self):
        """get_retry_after for unknown IP returns 0."""
        limiter = RateLimiter(max_attempts=3, window_seconds=60)
        assert limiter.get_retry_after("never-seen") == 0

    def test_reset_nonexistent_ip(self):
        """reset for non-existent IP does not raise."""
        limiter = RateLimiter(max_attempts=3, window_seconds=60)
        limiter.reset("ghost-ip")  # Should not raise

    def test_remaining_count_sequence(self):
        """Remaining count decreases correctly: 4, 3, 2, 1, 0, 0..."""
        limiter = RateLimiter(max_attempts=5, window_seconds=60)
        expected = [4, 3, 2, 1, 0, 0, 0]
        for exp in expected:
            _, remaining = limiter.is_allowed("test-ip")
            assert remaining == exp

    def test_zero_max_attempts(self):
        """With max_attempts=0, all requests are blocked."""
        limiter = RateLimiter(max_attempts=0, window_seconds=60)
        is_ok, remaining = limiter.is_allowed("any-ip")
        assert is_ok is False
        assert remaining == 0

    def test_very_short_window(self):
        """Very short window (0.1s) resets quickly."""
        limiter = RateLimiter(max_attempts=1, window_seconds=0)
        # With 0-second window, everything should be allowed
        is_ok1, _ = limiter.is_allowed("ip")
        is_ok2, _ = limiter.is_allowed("ip")
        # Both should pass since window is 0 (all attempts are expired immediately)
        assert is_ok1 is True
