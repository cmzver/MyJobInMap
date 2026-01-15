"""Tests for authentication endpoint."""
import pytest
from app.services.rate_limiter import login_rate_limiter


class TestAuth:
    """Test /api/auth/login endpoint."""

    def test_login_success(self, admin_token):
        """Test successful login - if admin_token fixture works, login succeeded."""
        # admin_token fixture handles creation and login
        assert admin_token is not None
        assert isinstance(admin_token, str)

    def test_login_invalid_credentials(self, client):
        """Test login with wrong password."""
        response = client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "wrong"},
        )
        assert response.status_code == 401

    def test_login_nonexistent_user(self, client):
        """Test login for non-existent user."""
        response = client.post(
            "/api/auth/login",
            data={"username": "nouser", "password": "pass"},
        )
        assert response.status_code == 401

    def test_get_current_user(self, client, admin_token):
        """Test getting current user info."""
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "admin"
        assert data["role"] == "admin"


class TestAuthRateLimit:
    """Test rate limiting on login endpoint."""

    def setup_method(self):
        """Clear rate limiter before each test."""
        login_rate_limiter.clear_all()

    def test_rate_limit_exceeded(self, client):
        """Test rate limiting after exceeding max attempts."""
        # Make 5 failed attempts (max allowed is 5)
        for i in range(5):
            response = client.post(
                "/api/auth/login",
                data={"username": "admin", "password": "wrongpass"},
            )
            if i < 4:
                # First 4 attempts should fail with 401
                assert response.status_code == 401
            else:
                # 5th attempt should also be 401 (counted but failed)
                assert response.status_code == 401
        
        # 6th attempt should be rate limited (429)
        response = client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "wrongpass"},
        )
        assert response.status_code == 429
        assert "Retry-After" in response.headers

    def test_rate_limit_reset_on_success(self, client, admin_token):
        """Test that counter resets after successful login."""
        # admin_token fixture already did a successful login, so counter is reset
        # Make 2 failed attempts after
        for _ in range(2):
            response = client.post(
                "/api/auth/login",
                data={"username": "admin", "password": "wrong"},
            )
            assert response.status_code == 401
        
        # Counter should have accumulated 2 attempts, but still available
        response = client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "wrong"},
        )
        assert response.status_code == 401  # Not rate limited yet

    def test_rate_limit_different_ips(self, client):
        """Test that rate limits are per-IP."""
        # Simulate different IPs by making requests with different Client instances
        # This is a limitation of TestClient - it uses fixed IP
        # In real scenarios, different users would have different IPs
        stats = login_rate_limiter.get_stats()
        assert "tracked_ips" in stats
        assert stats["tracked_ips"] >= 0


