"""
Rate limiter service for authentication endpoints.

Implements a thread-safe in-memory rate limiter with IP-based tracking.
Prevents brute-force attacks by limiting login attempts per IP address.

Configuration via .env or environment variables:
    RATE_LIMIT_MAX_ATTEMPTS=5      # Max login attempts per window
    RATE_LIMIT_WINDOW_SECONDS=60   # Window duration in seconds
"""

import logging
import threading
import time
import uuid
from typing import Dict, List, Tuple

logger = logging.getLogger(__name__)


class RateLimiter:
    """Thread-safe in-memory rate limiter with time-based window tracking."""

    # Maximum number of tracked IPs to prevent unbounded memory growth
    MAX_TRACKED_IPS = 10_000

    def __init__(self, max_attempts: int = 5, window_seconds: int = 60):
        """
        Initialize rate limiter.

        Args:
            max_attempts: Maximum attempts allowed per window
            window_seconds: Time window in seconds (default 60 = 1 minute)
        """
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        # Dictionary: {ip: [timestamp, ...]}
        self._attempts: Dict[str, List[float]] = {}
        self._lock = threading.Lock()

    def _cleanup_expired(self, current_time: float) -> None:
        """Remove expired entries. Must be called with lock held."""
        window_start = current_time - self.window_seconds
        expired_ips = [
            ip
            for ip, attempts in self._attempts.items()
            if not any(ts > window_start for ts in attempts)
        ]
        for ip in expired_ips:
            del self._attempts[ip]

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

        with self._lock:
            # Prevent unbounded memory growth under DDoS
            if len(self._attempts) > self.MAX_TRACKED_IPS:
                self._cleanup_expired(current_time)

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
        with self._lock:
            if ip_address not in self._attempts or not self._attempts[ip_address]:
                return 0

            current_time = time.time()
            oldest_attempt = self._attempts[ip_address][0]
            window_start = oldest_attempt + self.window_seconds

            retry_after = int(max(0, window_start - current_time))
            return retry_after

    def reset(self, ip_address: str) -> None:
        """Reset attempts for specific IP address."""
        with self._lock:
            if ip_address in self._attempts:
                del self._attempts[ip_address]

    def clear_all(self) -> None:
        """Clear all tracked attempts (useful for testing)."""
        with self._lock:
            self._attempts.clear()

    def get_stats(self) -> Dict[str, int]:
        """Get current statistics. Also cleans up expired entries."""
        current_time = time.time()

        with self._lock:
            self._cleanup_expired(current_time)
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


class SharedRateLimiter(RateLimiter):
    """Лимитер, общий для всех процессов API, — окно попыток в Redis.

    Включается REALTIME_REDIS_ENABLED. Без Redis или при его сбое считает в
    памяти процесса (как RateLimiter): вход не должен падать из-за Redis.
    """

    KEY_PREFIX = "fieldworker:ratelimit"
    # После сбоя Redis не обращаться к нему столько секунд: иначе каждый
    # запрос ждал бы таймаут соединения, прежде чем перейти на память.
    REDIS_BACKOFF_SECONDS = 5.0

    def __init__(self, name: str, max_attempts: int = 5, window_seconds: int = 60):
        super().__init__(max_attempts=max_attempts, window_seconds=window_seconds)
        self.name = name
        self._redis_down_until = 0.0

    def _key(self, ip_address: str) -> str:
        return f"{self.KEY_PREFIX}:{self.name}:{ip_address}"

    def _redis(self):
        from app.services import redis_realtime

        if not redis_realtime.enabled():
            return None
        if time.monotonic() < self._redis_down_until:
            return None
        return redis_realtime.sync_client()

    def _redis_failed(self, exc: Exception) -> None:
        self._redis_down_until = time.monotonic() + self.REDIS_BACKOFF_SECONDS
        logger.warning(
            "Лимитер %s: Redis недоступен (%s), считаем в памяти",
            self.name,
            type(exc).__name__,
        )

    def is_allowed(self, ip_address: str) -> Tuple[bool, int]:
        redis = self._redis()
        if redis is None:
            return super().is_allowed(ip_address)
        now = time.time()
        key = self._key(ip_address)
        try:
            pipe = redis.pipeline()
            pipe.zremrangebyscore(key, "-inf", now - self.window_seconds)
            pipe.zcard(key)
            pipe.zadd(key, {f"{now:.6f}:{uuid.uuid4().hex[:8]}": now})
            pipe.expire(key, self.window_seconds)
            _, count, _, _ = pipe.execute()
        except Exception as exc:  # noqa: BLE001
            self._redis_failed(exc)
            return super().is_allowed(ip_address)
        allowed = count < self.max_attempts
        return allowed, (self.max_attempts - count - 1) if allowed else 0

    def get_retry_after(self, ip_address: str) -> int:
        redis = self._redis()
        if redis is None:
            return super().get_retry_after(ip_address)
        try:
            oldest = redis.zrange(self._key(ip_address), 0, 0, withscores=True)
        except Exception:  # noqa: BLE001
            return super().get_retry_after(ip_address)
        if not oldest:
            return 0
        return int(max(0, oldest[0][1] + self.window_seconds - time.time()))

    def reset(self, ip_address: str) -> None:
        super().reset(ip_address)
        redis = self._redis()
        if redis is not None:
            try:
                redis.delete(self._key(ip_address))
            except Exception:  # noqa: BLE001
                pass


class SharedWindowCounter(SharedRateLimiter):
    """Общий счётчик запросов для DDoS-защиты — дёшево на каждый запрос.

    В отличие от SharedRateLimiter не хранит отметку каждого запроса: счётчики
    двух соседних окон (INCR) и оценка скользящего окна
    ``предыдущее × (доля, ещё попадающая в окно) + текущее`` — один запрос
    к Redis и O(1) памяти на IP при любом потоке.
    """

    KEY_PREFIX = "fieldworker:reqcount"

    def _bucket_key(self, ip_address: str, bucket: int) -> str:
        return f"{self.KEY_PREFIX}:{self.name}:{ip_address}:{bucket}"

    def is_allowed(self, ip_address: str) -> Tuple[bool, int]:
        redis = self._redis()
        if redis is None:
            return RateLimiter.is_allowed(self, ip_address)
        now = time.time()
        bucket, offset = divmod(now, self.window_seconds)
        bucket = int(bucket)
        current_key = self._bucket_key(ip_address, bucket)
        try:
            pipe = redis.pipeline()
            pipe.incr(current_key)
            pipe.expire(current_key, self.window_seconds * 2)
            pipe.get(self._bucket_key(ip_address, bucket - 1))
            current, _, previous = pipe.execute()
        except Exception as exc:  # noqa: BLE001
            self._redis_failed(exc)
            return RateLimiter.is_allowed(self, ip_address)
        weight = 1.0 - offset / self.window_seconds
        # Текущий запрос уже учтён в current — сравниваем «до него»
        before = int(previous or 0) * weight + int(current) - 1
        allowed = before < self.max_attempts
        return allowed, max(0, int(self.max_attempts - before - 1)) if allowed else 0

    def get_retry_after(self, ip_address: str) -> int:
        return RateLimiter.get_retry_after(self, ip_address)

    def reset(self, ip_address: str) -> None:
        RateLimiter.reset(self, ip_address)
        self._delete_keys(f"{self.KEY_PREFIX}:{self.name}:{ip_address}:*")

    def clear_all(self) -> None:
        super().clear_all()
        self._delete_keys(f"{self.KEY_PREFIX}:{self.name}:*")

    def _delete_keys(self, pattern: str) -> None:
        redis = self._redis()
        if redis is None:
            return
        try:
            keys = list(redis.scan_iter(match=pattern, count=500))
            if keys:
                redis.delete(*keys)
        except Exception as exc:  # noqa: BLE001
            self._redis_failed(exc)

    def get_stats(self) -> Dict[str, int]:
        redis = self._redis()
        if redis is None:
            return super().get_stats()
        bucket = int(time.time() // self.window_seconds)
        try:
            # Ключи текущего окна = IP, от которых сейчас идут запросы.
            # Обход ограничен: это цифра для админки, не учёт.
            tracked = 0
            for _ in redis.scan_iter(
                match=f"{self.KEY_PREFIX}:{self.name}:*:{bucket}", count=500
            ):
                tracked += 1
                if tracked >= self.MAX_TRACKED_IPS:
                    break
        except Exception as exc:  # noqa: BLE001
            self._redis_failed(exc)
            return super().get_stats()
        return {"tracked_ips": tracked, "active_windows": tracked}


# Global rate limiter instance for login endpoint
# Configured via RATE_LIMIT_MAX_ATTEMPTS / RATE_LIMIT_WINDOW_SECONDS in .env
def _create_login_rate_limiter() -> RateLimiter:
    try:
        from app.config import settings

        return SharedRateLimiter(
            "login",
            max_attempts=settings.RATE_LIMIT_MAX_ATTEMPTS,
            window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
        )
    except Exception:
        # Fallback defaults if config not available (e.g. isolated tests)
        return SharedRateLimiter("login", max_attempts=5, window_seconds=60)


login_rate_limiter = _create_login_rate_limiter()
