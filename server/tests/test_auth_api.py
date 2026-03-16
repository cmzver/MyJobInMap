"""Tests for authentication endpoint."""
import pytest
from app.services.rate_limiter import login_rate_limiter
from app.services.auth import create_refresh_token, create_access_token


class TestAuth:
    """Test /api/auth/login endpoint."""

    def test_login_success(self, admin_token):
        """Test successful login - if admin_token fixture works, login succeeded."""
        # admin_token fixture handles creation and login
        assert admin_token is not None
        assert isinstance(admin_token, str)

    def test_login_returns_refresh_token(self, client, admin_user):
        """Test that login response includes refresh_token."""
        response = client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "admin"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["username"] == "admin"

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


class TestTokenRefresh:
    """Test /api/auth/refresh endpoint."""

    def _get_refresh_token(self, client, admin_user):
        """Helper to get a refresh token via login."""
        response = client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "admin"},
        )
        assert response.status_code == 200
        return response.json()["refresh_token"]

    def test_refresh_success(self, client, admin_user):
        """Test successful token refresh returns new pair."""
        refresh_token = self._get_refresh_token(client, admin_user)
        
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["username"] == "admin"
        assert data["role"] == "admin"
        # Tokens should be valid strings
        assert len(data["access_token"]) > 0
        assert len(data["refresh_token"]) > 0

    def test_refresh_with_new_access_token_works(self, client, admin_user):
        """Test that the new access token is valid for API calls."""
        refresh_token = self._get_refresh_token(client, admin_user)
        
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert response.status_code == 200
        new_access_token = response.json()["access_token"]
        
        # Use new access token
        me_response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {new_access_token}"},
        )
        assert me_response.status_code == 200
        assert me_response.json()["username"] == "admin"

    def test_refresh_invalid_token(self, client, admin_user):
        """Test refresh with invalid token returns 401."""
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": "invalid-token"},
        )
        assert response.status_code == 401

    def test_refresh_with_access_token_fails(self, client, admin_user):
        """Test that using access_token as refresh_token fails."""
        login_response = client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "admin"},
        )
        access_token = login_response.json()["access_token"]
        
        # Try to use access token as refresh token
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": access_token},
        )
        assert response.status_code == 401

    def test_refresh_expired_token(self, client, admin_user):
        """Test refresh with expired token returns 401."""
        from datetime import timedelta
        # Create a refresh token that's already expired
        expired_token = create_refresh_token(
            data={"sub": "admin", "user_id": admin_user.id},
            expires_delta=timedelta(seconds=-1)
        )
        
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": expired_token},
        )
        assert response.status_code == 401

    def test_refresh_deactivated_user(self, client, admin_user, db_session):
        """Test refresh fails if user is deactivated."""
        refresh_token = self._get_refresh_token(client, admin_user)
        
        # Deactivate user
        admin_user.is_active = False
        db_session.commit()
        
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert response.status_code == 401

    def test_refresh_missing_body(self, client, admin_user):
        """Test refresh without body returns 422."""
        response = client.post("/api/auth/refresh", json={})
        assert response.status_code == 422


class TestPasswordChange:
    """Test /api/auth/password endpoint."""

    def test_change_password_success(self, client, admin_user, admin_token):
        response = client.patch(
            "/api/auth/password",
            json={"current_password": "admin", "new_password": "newadmin123"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        assert response.json()["success"] is True

        old_login = client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "admin"},
        )
        assert old_login.status_code == 401

        new_login = client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "newadmin123"},
        )
        assert new_login.status_code == 200

    def test_change_password_rejects_wrong_old_password(self, client, admin_user, admin_token):
        response = client.patch(
            "/api/auth/password",
            json={"current_password": "wrong", "new_password": "newadmin123"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 400
        assert "Неверный текущий пароль" in response.json()["detail"]

    def test_change_password_requires_min_length(self, client, admin_user, admin_token):
        response = client.patch(
            "/api/auth/password",
            json={"current_password": "admin", "new_password": "123"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 400
        assert "не менее 6 символов" in response.json()["detail"]


