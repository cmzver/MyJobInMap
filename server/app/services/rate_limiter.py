"""
Rate limiter service for authentication endpoints.

Implements a simple in-memory rate limiter with IP-based tracking.
Prevents brute-force attacks by limiting login attempts per IP address.
"""

import time
from typing import Dict, Tuple, List


class RateLimiter:
    """Simple in-memory rate limiter with time-based window tracking."""

    def __init__(self, max_attempts: int = 5, window_seconds: int = 60):
        """
        Initialize rate limiter.

        Args:
            max_attempts: Maximum attempts allowed per window
            window_seconds: Time window in seconds (default 60 = 1 minute)
        """
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        # Dictionary: {ip: [(timestamp, attempt_count), ...]}
        self._attempts: Dict[str, List[float]] = {}

    def is_allowed(self, ip_address: str) -> Tuple[bool, int]:
        """
        Check if request from IP address is allowed.

        Args:
            ip_address: Client IP address

        Returns:
            Tuple (is_allowed: bool, remaining_attempts: int)
        """
        current_time = time.time()
        window_start = current_time - self.window_seconds

        # Initialize IP entry if not exists
        if ip_address not in self._attempts:
            self._attempts[ip_address] = []

        # Remove old attempts outside current window
        self._attempts[ip_address] = [
            timestamp
            for timestamp in self._attempts[ip_address]
            if timestamp > window_start
        ]

        # Get current count and check limit
        current_count = len(self._attempts[ip_address])
        is_allowed = current_count < self.max_attempts

        # Calculate remaining before recording this attempt
        if is_allowed:
            remaining = self.max_attempts - current_count - 1
        else:
            remaining = 0

        # Record this attempt
        self._attempts[ip_address].append(current_time)

        return is_allowed, remaining

    def get_retry_after(self, ip_address: str) -> int:
        """
        Get seconds to wait before next attempt is allowed.

        Args:
            ip_address: Client IP address

        Returns:
            Seconds to wait (0 if allowed now)
        """
        if ip_address not in self._attempts or not self._attempts[ip_address]:
            return 0

        current_time = time.time()
        oldest_attempt = self._attempts[ip_address][0]
        window_start = oldest_attempt + self.window_seconds

        retry_after = int(max(0, window_start - current_time))
        return retry_after

    def reset(self, ip_address: str) -> None:
        """Reset attempts for specific IP address."""
        if ip_address in self._attempts:
            self._attempts[ip_address] = []

    def clear_all(self) -> None:
        """Clear all tracked attempts (useful for testing)."""
        self._attempts.clear()

    def get_stats(self) -> Dict[str, int]:
        """Get current statistics."""
        current_time = time.time()
        window_start = current_time - self.window_seconds

        return {
            "tracked_ips": len(self._attempts),
            "active_windows": sum(
                1
                for attempts in self._attempts.values()
                if any(ts > window_start for ts in attempts)
            ),
            "total_attempts_in_window": sum(
                sum(1 for ts in attempts if ts > window_start)
                for attempts in self._attempts.values()
            ),
        }


# Global rate limiter instance for login endpoint
# 5 attempts per 60 seconds
login_rate_limiter = RateLimiter(max_attempts=5, window_seconds=60)
