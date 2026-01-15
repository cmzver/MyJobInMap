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

